import { createHmac } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignRecipients, campaigns, contacts, conversations, messageMedia, messages, metaWebhookEvents, whatsappAccounts, type JsonValue } from "@/db/schema";
import { getServerEnv } from "@/lib/config";
import { constantTimeEqual, generateId, hashSecret, normalizePhoneNumber } from "@/lib/security/crypto";
import { enqueueJob } from "@/lib/queue/jobs";
import { publishTenantEvent } from "@/lib/realtime/bus";
import { dispatchTenantEvent } from "@/services/webhooks/webhooks";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]));
  return String(value);
}

function timestampDate(value: unknown): Date {
  const numeric = typeof value === "number" ? value : Number(readString(value));
  if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric * 1000);
  return new Date();
}

function contactName(message: Record<string, unknown>, fallback: string): string {
  const profile = readRecord(readArray(message.profile)[0]);
  return readString(profile.name) ?? fallback;
}

function messageType(value: unknown): "text" | "image" | "video" | "audio" | "document" | "location" | "contact" | "system" {
  const type = readString(value);
  if (type === "text" || type === "image" || type === "video" || type === "audio" || type === "document" || type === "location") return type;
  if (type === "contacts" || type === "contact") return "contact";
  return "system";
}

function messageBody(message: Record<string, unknown>, type: string): string | null {
  if (type === "text") {
    const text = readRecord(message.text);
    return readString(text.body) ?? null;
  }
  if (type === "image" || type === "video" || type === "audio" || type === "document") {
    const media = readRecord(message[type]);
    return readString(media.caption) ?? `[${type}]`;
  }
  if (type === "location") return "[location]";
  if (type === "contact") return "[contact]";
  if (type === "button" || type === "interactive") return "[interactive message]";
  return "[message]";
}

function mediaId(message: Record<string, unknown>, type: string): string | null {
  if (!["image", "video", "audio", "document"].includes(type)) return null;
  return readString(readRecord(message[type]).id) ?? null;
}

export function getWhatsappVerificationToken(): string {
  const token = getServerEnv().META_WEBHOOK_VERIFY_TOKEN;
  if (!token || token.length < 8) throw new Error("META_WEBHOOK_VERIFY_TOKEN must be configured with at least 8 characters");
  return token;
}

export function verifyMetaSignature(rawBody: string, signature: string | null): boolean {
  const appSecret = getServerEnv().META_APP_SECRET;
  if (!appSecret || !signature) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return constantTimeEqual(expected, signature);
}

async function findOrCreateContact(input: { organizationId: string; accountId: string; phoneNumber: string; name: string }): Promise<typeof contacts.$inferSelect> {
  const existing = await db.select().from(contacts).where(and(eq(contacts.organizationId, input.organizationId), eq(contacts.phoneNumber, input.phoneNumber), isNull(contacts.deletedAt))).limit(1);
  if (existing[0]) {
    if (input.name && input.name !== input.phoneNumber && existing[0].name === input.phoneNumber) await db.update(contacts).set({ name: input.name, whatsappAccountId: input.accountId, updatedAt: new Date() }).where(eq(contacts.id, existing[0].id));
    return existing[0];
  }
  const inserted = await db.insert(contacts).values({ id: generateId(), organizationId: input.organizationId, whatsappAccountId: input.accountId, name: input.name, phoneNumber: input.phoneNumber, lastInteractionAt: new Date() }).returning();
  const contact = inserted[0];
  if (!contact) throw new Error("Contact could not be created");
  return contact;
}

async function findOrCreateConversation(input: { organizationId: string; accountId: string; contactId: string }): Promise<typeof conversations.$inferSelect> {
  const existing = await db.select().from(conversations).where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.whatsappAccountId, input.accountId), eq(conversations.contactId, input.contactId), isNull(conversations.deletedAt))).limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db.insert(conversations).values({ id: generateId(), organizationId: input.organizationId, whatsappAccountId: input.accountId, contactId: input.contactId, lastMessageAt: new Date() }).returning();
  const conversation = inserted[0];
  if (!conversation) throw new Error("Conversation could not be created");
  return conversation;
}

async function processIncomingMessage(input: { organizationId: string; accountId: string; message: Record<string, unknown> }): Promise<void> {
  const from = readString(input.message.from);
  const externalId = readString(input.message.id);
  if (!from || !externalId) return;
  const phoneNumber = normalizePhoneNumber(from);
  const type = messageType(input.message.type);
  const body = messageBody(input.message, type);
  const contact = await findOrCreateContact({ organizationId: input.organizationId, accountId: input.accountId, phoneNumber, name: contactName(input.message, phoneNumber) });
  const conversation = await findOrCreateConversation({ organizationId: input.organizationId, accountId: input.accountId, contactId: contact.id });
  const existing = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.whatsappAccountId, input.accountId), eq(messages.externalId, externalId))).limit(1);
  if (existing[0]) return;
  const createdAt = timestampDate(input.message.timestamp);
  const inserted = await db.insert(messages).values({ id: generateId(), organizationId: input.organizationId, conversationId: conversation.id, whatsappAccountId: input.accountId, contactId: contact.id, externalId, direction: "inbound", type, status: "delivered", body, metadata: toJsonValue(input.message), createdAt, updatedAt: createdAt, deliveredAt: createdAt }).returning({ id: messages.id });
  const messageId = inserted[0]?.id;
  if (!messageId) return;
  const id = mediaId(input.message, type);
  if (id) await db.insert(messageMedia).values({ id: generateId(), messageId, type, mediaUrl: `meta://media/${id}`, mimeType: readString(input.message.type) });
  await db.update(contacts).set({ lastInteractionAt: createdAt, updatedAt: new Date() }).where(eq(contacts.id, contact.id));
  await db.update(conversations).set({ unreadCount: sql`${conversations.unreadCount} + 1`, lastMessageAt: createdAt, lastMessagePreview: body ?? `[${type}]`, updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
  publishTenantEvent({ organizationId: input.organizationId, type: "message.received", payload: { conversationId: conversation.id, messageId, contactId: contact.id, messageType: type } });
  await enqueueJob({ organizationId: input.organizationId, type: "automation.incoming_message", payload: { accountId: input.accountId, contactId: contact.id, conversationId: conversation.id, messageId, body } });
  await dispatchTenantEvent({ organizationId: input.organizationId, eventType: "message.received", payload: { conversationId: conversation.id, messageId, contactId: contact.id, messageType: type } });
}

async function processStatusUpdate(input: { organizationId: string; accountId: string; status: Record<string, unknown> }): Promise<void> {
  const externalId = readString(input.status.id);
  const status = readString(input.status.status);
  if (!externalId || !status || !["sent", "delivered", "read", "failed"].includes(status)) return;
  const rows = await db.select().from(messages).where(and(eq(messages.organizationId, input.organizationId), eq(messages.whatsappAccountId, input.accountId), eq(messages.externalId, externalId))).limit(1);
  const message = rows[0];
  if (!message) return;
  const occurredAt = timestampDate(input.status.timestamp);
  const errors = readArray(input.status.errors);
  const error = errors[0] ? readRecord(errors[0]) : undefined;
  const messageStatus = status as "sent" | "delivered" | "read" | "failed";
  await db.update(messages).set({ status: messageStatus, sentAt: messageStatus === "sent" ? occurredAt : message.sentAt, deliveredAt: messageStatus === "delivered" || messageStatus === "read" ? occurredAt : message.deliveredAt, readAt: messageStatus === "read" ? occurredAt : message.readAt, failedAt: messageStatus === "failed" ? occurredAt : message.failedAt, errorCode: readString(error?.code), errorMessage: readString(error?.message), updatedAt: new Date() }).where(eq(messages.id, message.id));
  const recipientRows = await db.select().from(campaignRecipients).where(eq(campaignRecipients.externalMessageId, externalId)).limit(1);
  const recipient = recipientRows[0];
  if (recipient && recipient.status !== messageStatus) {
    await db.update(campaignRecipients).set({ status: messageStatus, deliveredAt: messageStatus === "delivered" || messageStatus === "read" ? occurredAt : null, readAt: messageStatus === "read" ? occurredAt : null, failedAt: messageStatus === "failed" ? occurredAt : null, updatedAt: new Date() }).where(eq(campaignRecipients.id, recipient.id));
    if (messageStatus === "delivered" && recipient.status === "sent") await db.update(campaigns).set({ deliveredCount: sql`${campaigns.deliveredCount} + 1`, updatedAt: new Date() }).where(eq(campaigns.id, recipient.campaignId));
    if (messageStatus === "read") {
      const updates = { updatedAt: new Date(), ...(recipient.status !== "delivered" && recipient.status !== "read" ? { deliveredCount: sql`${campaigns.deliveredCount} + 1` } : {}), ...(recipient.status !== "read" ? { readCount: sql`${campaigns.readCount} + 1` } : {}) };
      await db.update(campaigns).set(updates).where(eq(campaigns.id, recipient.campaignId));
    }
    if (messageStatus === "failed" && recipient.status !== "failed") await db.update(campaigns).set({ failedCount: sql`${campaigns.failedCount} + 1`, updatedAt: new Date() }).where(eq(campaigns.id, recipient.campaignId));
  }
  publishTenantEvent({ organizationId: input.organizationId, type: `message.${status}`, payload: { messageId: message.id, externalId, status } });
  await dispatchTenantEvent({ organizationId: input.organizationId, eventType: `message.${status}`, payload: { messageId: message.id, externalId, status } });
}

export async function processMetaWebhook(rawBody: string, payload: unknown): Promise<{ duplicate: boolean; eventId: string }> {
  const providerEventId = hashSecret(rawBody);
  const eventId = generateId();
  const inserted = await db.insert(metaWebhookEvents).values({ id: eventId, providerEventId, payload: toJsonValue(payload), status: "processing" }).onConflictDoNothing({ target: metaWebhookEvents.providerEventId }).returning({ id: metaWebhookEvents.id });
  if (!inserted[0]) return { duplicate: true, eventId: providerEventId };
  try {
    for (const entry of readArray(isRecord(payload) ? payload.entry : undefined)) {
      const entryRecord = readRecord(entry);
      for (const change of readArray(entryRecord.changes)) {
        const value = readRecord(readRecord(change).value);
        const phoneNumberId = readString(readRecord(value.metadata).phone_number_id);
        if (!phoneNumberId) continue;
        const accountRows = await db.select().from(whatsappAccounts).where(and(eq(whatsappAccounts.phoneNumberId, phoneNumberId), isNull(whatsappAccounts.deletedAt))).limit(1);
        const account = accountRows[0];
        if (!account) continue;
        await db.update(whatsappAccounts).set({ lastWebhookAt: new Date(), updatedAt: new Date() }).where(eq(whatsappAccounts.id, account.id));
        for (const message of readArray(value.messages)) await processIncomingMessage({ organizationId: account.organizationId, accountId: account.id, message: readRecord(message) });
        for (const status of readArray(value.statuses)) await processStatusUpdate({ organizationId: account.organizationId, accountId: account.id, status: readRecord(status) });
      }
    }
    await db.update(metaWebhookEvents).set({ status: "processed", processedAt: new Date() }).where(eq(metaWebhookEvents.id, eventId));
    return { duplicate: false, eventId };
  } catch (error) {
    await db.update(metaWebhookEvents).set({ status: "failed", errorMessage: error instanceof Error ? error.message : "Unknown webhook processing error" }).where(eq(metaWebhookEvents.id, eventId));
    throw error;
  }
}
