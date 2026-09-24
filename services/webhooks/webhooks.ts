import { and, desc, eq } from "drizzle-orm";
import { createHmac } from "node:crypto";
import { db } from "@/db";
import { webhookEvents, webhooks, type Webhook, type JsonValue } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { enqueueJob } from "@/lib/queue/jobs";
import { assertSafeRemoteUrl } from "@/lib/security/url";
import { decryptSecret, encryptSecret, generateId, generateOpaqueToken } from "@/lib/security/crypto";
import { webhookSchema, type WebhookInput } from "@/lib/validation/schemas";

export type PublicWebhook = Omit<Webhook, "secretEncrypted">;

function toPublic(webhook: Webhook): PublicWebhook {
  return { id: webhook.id, organizationId: webhook.organizationId, name: webhook.name, url: webhook.url, events: webhook.events, enabled: webhook.enabled, lastDeliveryAt: webhook.lastDeliveryAt, lastDeliveryStatus: webhook.lastDeliveryStatus, failureCount: webhook.failureCount, createdBy: webhook.createdBy, createdAt: webhook.createdAt, updatedAt: webhook.updatedAt };
}

export async function listWebhooks(organizationId: string): Promise<PublicWebhook[]> {
  const rows = await db.select().from(webhooks).where(eq(webhooks.organizationId, organizationId)).orderBy(desc(webhooks.createdAt));
  return rows.map(toPublic);
}

export async function createWebhook(organizationId: string, userId: string, input: WebhookInput): Promise<{ webhook: PublicWebhook; secret: string }> {
  const parsed = webhookSchema.parse(input);
  const secret = generateOpaqueToken(32);
  const inserted = await db.insert(webhooks).values({ id: generateId(), organizationId, name: parsed.name, url: parsed.url, events: parsed.events, secretEncrypted: encryptSecret(secret), enabled: parsed.enabled, createdBy: userId }).returning();
  const webhook = inserted[0];
  if (!webhook) throw new AppError("INTERNAL_ERROR", "Webhook could not be created", 500);
  return { webhook: toPublic(webhook), secret };
}

export async function updateWebhook(organizationId: string, webhookId: string, input: Partial<WebhookInput>): Promise<PublicWebhook> {
  const parsed = webhookSchema.partial().parse(input);
  const updated = await db.update(webhooks).set({ name: parsed.name, url: parsed.url, events: parsed.events, enabled: parsed.enabled, updatedAt: new Date() }).where(and(eq(webhooks.id, webhookId), eq(webhooks.organizationId, organizationId))).returning();
  const webhook = updated[0];
  if (!webhook) throw new AppError("NOT_FOUND", "Webhook not found", 404);
  return toPublic(webhook);
}

export async function deleteWebhook(organizationId: string, webhookId: string): Promise<void> {
  await db.update(webhooks).set({ enabled: false, updatedAt: new Date() }).where(and(eq(webhooks.id, webhookId), eq(webhooks.organizationId, organizationId)));
}

export async function dispatchTenantEvent(input: { organizationId: string; eventType: string; payload: JsonValue }): Promise<void> {
  try {
    const configured = await db.select().from(webhooks).where(and(eq(webhooks.organizationId, input.organizationId), eq(webhooks.enabled, true)));
    for (const webhook of configured) {
      if (!webhook.events.includes(input.eventType)) continue;
      const eventRows = await db.insert(webhookEvents).values({ id: generateId(), organizationId: input.organizationId, webhookId: webhook.id, eventType: input.eventType, payload: input.payload }).returning({ id: webhookEvents.id });
      const event = eventRows[0];
      if (event) await enqueueJob({ organizationId: input.organizationId, type: "webhook.deliver", payload: { organizationId: input.organizationId, webhookId: webhook.id, eventId: event.id }, maxAttempts: 8 });
    }
  } catch {
    return;
  }
}

export async function deliverWebhook(input: { organizationId: string; webhookId: string; eventId: string }): Promise<void> {
  const webhookRows = await db.select().from(webhooks).where(and(eq(webhooks.id, input.webhookId), eq(webhooks.organizationId, input.organizationId))).limit(1);
  const webhook = webhookRows[0];
  const eventRows = await db.select().from(webhookEvents).where(and(eq(webhookEvents.id, input.eventId), eq(webhookEvents.organizationId, input.organizationId))).limit(1);
  const event = eventRows[0];
  if (!webhook || !event || !webhook.enabled) throw new AppError("NOT_FOUND", "Webhook delivery target was not found", 404);
  const body = JSON.stringify({ id: event.id, type: event.eventType, createdAt: event.createdAt.toISOString(), data: event.payload });
  const signature = `sha256=${createHmac("sha256", decryptSecret(webhook.secretEncrypted)).update(body).digest("hex")}`;
  const target = await assertSafeRemoteUrl(webhook.url);
  const response = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Signature": signature, "X-Webhook-Event": event.eventType, "User-Agent": "MessageShip-Webhooks/1.0" }, body, signal: AbortSignal.timeout(15_000) });
  await db.update(webhookEvents).set({ status: response.ok ? "delivered" : "failed", attempts: event.attempts + 1, responseStatus: response.status, errorMessage: response.ok ? null : `Endpoint returned ${response.status}`, deliveredAt: response.ok ? new Date() : null }).where(eq(webhookEvents.id, event.id));
  await db.update(webhooks).set({ lastDeliveryAt: new Date(), lastDeliveryStatus: response.ok ? "delivered" : "failed", failureCount: response.ok ? 0 : webhook.failureCount + 1, updatedAt: new Date() }).where(eq(webhooks.id, webhook.id));
  if (!response.ok) throw new AppError("EXTERNAL_SERVICE_ERROR", `Webhook endpoint returned ${response.status}`, 502);
}

export async function getWebhook(organizationId: string, webhookId: string): Promise<PublicWebhook> {
  const rows = await db.select().from(webhooks).where(and(eq(webhooks.id, webhookId), eq(webhooks.organizationId, organizationId))).limit(1);
  if (!rows[0]) throw new AppError("NOT_FOUND", "Webhook not found", 404);
  return toPublic(rows[0]);
}
