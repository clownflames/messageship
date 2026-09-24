import { and, desc, eq, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations, messages, templates, usageRecords, type Contact, type Conversation, type Message, type WhatsappAccount } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { publishTenantEvent } from "@/lib/realtime/bus";
import { generateId, normalizePhoneNumber } from "@/lib/security/crypto";
import { getOutboundMessagePolicy } from "@/lib/whatsapp/policy";
import { WhatsAppApiError, type WhatsAppContactInput, type WhatsAppMediaInput } from "@/lib/whatsapp/types";
import { dispatchTenantEvent } from "@/services/webhooks/webhooks";
import { createWhatsappClient, getWhatsappAccount } from "@/services/whatsapp/accounts";
import type { SendMessageInput } from "@/lib/validation/schemas";

const mediaLimits: Record<string, { mimeTypes: string[]; maxBytes: number }> = {
  image: { mimeTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 5 * 1024 * 1024 },
  video: { mimeTypes: ["video/mp4", "video/3gpp"], maxBytes: 16 * 1024 * 1024 },
  audio: { mimeTypes: ["audio/aac", "audio/mp4", "audio/mpeg", "audio/ogg"], maxBytes: 16 * 1024 * 1024 },
  document: { mimeTypes: ["application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], maxBytes: 100 * 1024 * 1024 },
};

export function validateMediaFile(type: string, mimeType: string | undefined, sizeBytes: number | undefined): void {
  const limit = mediaLimits[type];
  if (!limit) return;
  if (!mimeType || !limit.mimeTypes.includes(mimeType)) throw new AppError("INVALID_REQUEST", `Unsupported ${type} file type`, 400);
  if (sizeBytes === undefined || sizeBytes <= 0 || sizeBytes > limit.maxBytes) throw new AppError("INVALID_REQUEST", `${type} file exceeds the allowed size`, 400);
}

function mediaInput(input: SendMessageInput, type: string): WhatsAppMediaInput | null {
  const payload = input[type as "image" | "video" | "audio" | "document"];
  if (!payload) throw new AppError("INVALID_REQUEST", `The ${type} payload is required`, 400);
  const mediaId = payload.mediaId;
  const mediaUrl = payload.mediaUrl;
  if (!mediaId && !mediaUrl) throw new AppError("INVALID_REQUEST", `The ${type} payload must include a media id or URL`, 400);
  if (payload.mimeType || payload.sizeBytes) validateMediaFile(type, payload.mimeType, payload.sizeBytes);
  if (mediaUrl) {
    const parsed = new URL(mediaUrl);
    if (parsed.protocol !== "https:") throw new AppError("INVALID_REQUEST", "Media URLs must use HTTPS", 400);
  }
  return { id: mediaId, link: mediaUrl, caption: payload.caption, filename: payload.filename };
}

async function getOrCreateConversation(input: { organizationId: string; accountId: string; phoneNumber: string }): Promise<{ contact: Contact; conversation: Conversation }> {
  const normalized = normalizePhoneNumber(input.phoneNumber);
  const contactRows = await db.select().from(contacts).where(and(eq(contacts.organizationId, input.organizationId), eq(contacts.phoneNumber, normalized), isNull(contacts.deletedAt))).limit(1);
  let contact = contactRows[0];
  if (!contact) {
    try {
      contact = (await db.insert(contacts).values({ id: generateId(), organizationId: input.organizationId, whatsappAccountId: input.accountId, name: normalized, phoneNumber: normalized }).returning())[0];
    } catch {
      contact = (await db.select().from(contacts).where(and(eq(contacts.organizationId, input.organizationId), eq(contacts.phoneNumber, normalized), isNull(contacts.deletedAt))).limit(1))[0];
    }
  }
  if (!contact) throw new AppError("INTERNAL_ERROR", "Contact could not be prepared", 500);
  const conversationRows = await db.select().from(conversations).where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.whatsappAccountId, input.accountId), eq(conversations.contactId, contact.id), isNull(conversations.deletedAt))).limit(1);
  let conversation = conversationRows[0];
  if (!conversation) {
    try {
      conversation = (await db.insert(conversations).values({ id: generateId(), organizationId: input.organizationId, whatsappAccountId: input.accountId, contactId: contact.id }).returning())[0];
    } catch {
      conversation = (await db.select().from(conversations).where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.whatsappAccountId, input.accountId), eq(conversations.contactId, contact.id), isNull(conversations.deletedAt))).limit(1))[0];
    }
  }
  if (!conversation) throw new AppError("INTERNAL_ERROR", "Conversation could not be prepared", 500);
  return { contact, conversation };
}

async function lastInboundAt(input: { organizationId: string; accountId: string; contactId: string }): Promise<Date | null> {
  const rows = await db.select({ createdAt: messages.createdAt }).from(messages).where(and(eq(messages.organizationId, input.organizationId), eq(messages.whatsappAccountId, input.accountId), eq(messages.contactId, input.contactId), eq(messages.direction, "inbound"))).orderBy(desc(messages.createdAt)).limit(1);
  return rows[0]?.createdAt ?? null;
}

export async function getConversationPolicy(organizationId: string, accountId: string, contactId: string) {
  const inboundAt = await lastInboundAt({ organizationId, accountId, contactId });
  return getOutboundMessagePolicy({ type: "text", lastInboundAt: inboundAt });
}

function policyError(message: string): AppError {
  return new AppError("INVALID_REQUEST", message, 422);
}

async function assertTemplateApproved(input: { organizationId: string; accountId: string; name: string; language: string }): Promise<void> {
  const rows = await db.select({ status: templates.status }).from(templates).where(and(eq(templates.organizationId, input.organizationId), eq(templates.whatsappAccountId, input.accountId), eq(templates.name, input.name), eq(templates.language, input.language), isNull(templates.deletedAt))).limit(1);
  if (!rows[0]) throw new AppError("INVALID_REQUEST", "The selected template does not exist in this workspace", 400);
  if (rows[0].status !== "approved") throw new AppError("INVALID_REQUEST", "Only approved templates can be sent", 422);
}

export async function sendTenantMessage(organizationId: string, input: SendMessageInput): Promise<Message> {
  const account = await getWhatsappAccount(organizationId, input.whatsappAccountId);
  if (account.status !== "connected" || !account.phoneNumberId) throw new AppError("CONFLICT", "The selected WhatsApp account is not connected", 409);
  const phoneNumber = normalizePhoneNumber(input.to);
  const { contact, conversation } = await getOrCreateConversation({ organizationId, accountId: account.id, phoneNumber });
  const inboundAt = await lastInboundAt({ organizationId, accountId: account.id, contactId: contact.id });
  const policy = getOutboundMessagePolicy({ type: input.type, lastInboundAt: inboundAt });
  if (input.type === "template") {
    if (!input.template) throw policyError("Template details are required");
    await assertTemplateApproved({ organizationId, accountId: account.id, name: input.template.name, language: input.template.language });
  } else if (!policy.canSendFreeForm) {
    throw policyError(policy.reasonMessage);
  }
  const messageType = input.type === "contact" ? "contact" : input.type;
  const body = input.text?.body ?? (input.type === "template" ? `[template:${input.template?.name ?? ""}]` : `[${input.type}]`);
  const inserted = await db.insert(messages).values({ id: generateId(), organizationId, conversationId: conversation.id, whatsappAccountId: account.id, contactId: contact.id, direction: "outbound", type: messageType, status: "sending", body, metadata: { source: "dashboard" } }).returning();
  const message = inserted[0];
  if (!message) throw new AppError("INTERNAL_ERROR", "Message could not be created", 500);
  try {
    const client = createWhatsappClient(account);
    let result;
    if (input.type === "text") {
      if (!input.text) throw new AppError("INVALID_REQUEST", "Text is required", 400);
      result = await client.sendText({ phoneNumberId: account.phoneNumberId, to: phoneNumber, text: input.text.body });
    } else if (input.type === "template") {
      if (!input.template) throw new AppError("INVALID_REQUEST", "Template details are required", 400);
      result = await client.sendTemplate({ phoneNumberId: account.phoneNumberId, to: phoneNumber, template: { name: input.template.name, language: input.template.language, components: input.template.components } });
    } else if (input.type === "location") {
      if (!input.location) throw new AppError("INVALID_REQUEST", "Location details are required", 400);
      result = await client.sendLocation({ phoneNumberId: account.phoneNumberId, to: phoneNumber, location: input.location });
    } else if (input.type === "contact") {
      if (!input.contact) throw new AppError("INVALID_REQUEST", "Contact details are required", 400);
      result = await client.sendContacts({ phoneNumberId: account.phoneNumberId, to: phoneNumber, contacts: input.contact.contacts as WhatsAppContactInput[] });
    } else {
      result = await sendMedia(client, account, phoneNumber, input);
    }
    const updated = await db.update(messages).set({ externalId: result.messageId, status: "sent", sentAt: new Date(), updatedAt: new Date() }).where(eq(messages.id, message.id)).returning();
    await db.update(conversations).set({ lastMessageAt: new Date(), lastMessagePreview: body, updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
    const finalMessage = updated[0] ?? message;
    await db.insert(usageRecords).values({ id: generateId(), organizationId, type: "message", resourceType: "message", resourceId: finalMessage.id, metadata: { accountId: account.id, messageType: input.type } }).catch(() => undefined);
    publishTenantEvent({ organizationId, type: "message.sent", payload: { conversationId: conversation.id, messageId: finalMessage.id, externalId: result.messageId, status: finalMessage.status } });
    await dispatchTenantEvent({ organizationId, eventType: "message.sent", payload: { conversationId: conversation.id, messageId: finalMessage.id, status: finalMessage.status } });
    return finalMessage;
  } catch (error) {
    const failure = error instanceof WhatsAppApiError ? { code: error.code, message: error.message } : { code: "SEND_FAILED", message: error instanceof Error ? error.message : "Message could not be sent" };
    await db.update(messages).set({ status: "failed", failedAt: new Date(), errorCode: failure.code, errorMessage: failure.message, updatedAt: new Date() }).where(eq(messages.id, message.id));
    publishTenantEvent({ organizationId, type: "message.failed", payload: { conversationId: conversation.id, messageId: message.id } });
    await dispatchTenantEvent({ organizationId, eventType: "message.failed", payload: { conversationId: conversation.id, messageId: message.id, error: failure.message } });
    if (error instanceof AppError) throw error;
    throw new AppError("EXTERNAL_SERVICE_ERROR", failure.message, 502);
  }
}

async function sendMedia(client: ReturnType<typeof createWhatsappClient>, account: WhatsappAccount, to: string, input: SendMessageInput): Promise<{ messageId: string }> {
  if (input.type === "image") return client.sendImage({ phoneNumberId: account.phoneNumberId as string, to, media: mediaInput(input, "image") as WhatsAppMediaInput });
  if (input.type === "video") return client.sendVideo({ phoneNumberId: account.phoneNumberId as string, to, media: mediaInput(input, "video") as WhatsAppMediaInput });
  if (input.type === "audio") return client.sendAudio({ phoneNumberId: account.phoneNumberId as string, to, media: mediaInput(input, "audio") as WhatsAppMediaInput });
  return client.sendDocument({ phoneNumberId: account.phoneNumberId as string, to, media: mediaInput(input, "document") as WhatsAppMediaInput });
}

export async function listTenantConversations(organizationId: string, input: { accountId?: string; search?: string; archived?: boolean } = {}): Promise<Array<Conversation & { contactName: string; phoneNumber: string }>> {
  const conditions = [eq(conversations.organizationId, organizationId), isNull(conversations.deletedAt), eq(conversations.archived, input.archived ?? false)];
  if (input.accountId) conditions.push(eq(conversations.whatsappAccountId, input.accountId));
  const rows = await db.select({ conversation: conversations, contactName: contacts.name, phoneNumber: contacts.phoneNumber }).from(conversations).innerJoin(contacts, eq(conversations.contactId, contacts.id)).where(and(...conditions)).orderBy(desc(conversations.lastMessageAt));
  const search = input.search?.trim().toLowerCase();
  return rows.flatMap(({ conversation, contactName, phoneNumber }) => !search || contactName.toLowerCase().includes(search) || phoneNumber.includes(search) ? [{ ...conversation, contactName, phoneNumber }] : []);
}

export async function listTenantMessages(organizationId: string, conversationId?: string, limit = 100, search?: string): Promise<Array<Message>> {
  if (conversationId) {
    const conversation = await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId), isNull(conversations.deletedAt))).limit(1);
    if (!conversation[0]) throw new AppError("NOT_FOUND", "Conversation not found", 404);
  }
  const filters = [eq(messages.organizationId, organizationId)];
  if (conversationId) filters.push(eq(messages.conversationId, conversationId));
  if (search?.trim()) filters.push(ilike(messages.body, `%${search.trim()}%`));
  return db.select().from(messages).where(and(...filters)).orderBy(desc(messages.createdAt)).limit(limit);
}

export async function markConversationRead(organizationId: string, conversationId: string): Promise<void> {
  await db.update(conversations).set({ unreadCount: 0, updatedAt: new Date() }).where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId)));
}
