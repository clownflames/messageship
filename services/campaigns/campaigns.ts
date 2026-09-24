import { and, count, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignRecipients, campaigns, contacts, templateComponents, templates, type Campaign } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { enqueueJob } from "@/lib/queue/jobs";
import { generateId } from "@/lib/security/crypto";
import { campaignSchema, type CampaignInput, type SendMessageInput } from "@/lib/validation/schemas";
import { dispatchTenantEvent } from "@/services/webhooks/webhooks";
import { notifyWorkspaceMembers } from "@/services/notifications";
import { sendTenantMessage } from "@/services/whatsapp/messages";
import { getWhatsappAccount } from "@/services/whatsapp/accounts";

function replaceVariables(value: unknown, variables: Record<string, string>): unknown {
  if (typeof value === "string") return value.replace(/\{\{(\d+)\}\}/g, (_match, key: string) => variables[key] ?? "");
  if (Array.isArray(value)) return value.map((item) => replaceVariables(item, variables));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceVariables(item, variables)]));
  return value;
}

async function getTemplateForCampaign(organizationId: string, templateId: string) {
  const rows = await db.select().from(templates).where(and(eq(templates.id, templateId), eq(templates.organizationId, organizationId), isNull(templates.deletedAt))).limit(1);
  const template = rows[0];
  if (!template) throw new AppError("NOT_FOUND", "Template not found", 404);
  if (template.status !== "approved") throw new AppError("INVALID_REQUEST", "Campaigns can only use approved templates", 422);
  const components = await db.select().from(templateComponents).where(eq(templateComponents.templateId, templateId)).orderBy(templateComponents.position);
  return { template, components };
}

export async function listCampaigns(organizationId: string, search?: string): Promise<Campaign[]> {
  const filters = [eq(campaigns.organizationId, organizationId)];
  if (search?.trim()) filters.push(ilike(campaigns.name, `%${search.trim()}%`));
  return db.select().from(campaigns).where(and(...filters)).orderBy(desc(campaigns.createdAt));
}

export async function getCampaign(organizationId: string, campaignId: string): Promise<Campaign> {
  const rows = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, organizationId))).limit(1);
  const campaign = rows[0];
  if (!campaign) throw new AppError("NOT_FOUND", "Campaign not found", 404);
  return campaign;
}

export async function createCampaign(organizationId: string, userId: string, input: CampaignInput): Promise<Campaign> {
  const parsed = campaignSchema.parse(input);
  await getWhatsappAccount(organizationId, parsed.whatsappAccountId);
  await getTemplateForCampaign(organizationId, parsed.templateId);
  const uniqueContactIds = Array.from(new Set(parsed.contactIds));
  const contactRows = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.organizationId, organizationId), inArray(contacts.id, uniqueContactIds), isNull(contacts.deletedAt)));
  if (contactRows.length !== uniqueContactIds.length) throw new AppError("INVALID_REQUEST", "One or more campaign contacts are not in this workspace", 400);
  const scheduledAt = parsed.scheduledAt ? new Date(parsed.scheduledAt) : null;
  const campaignId = generateId();
  const status = scheduledAt && scheduledAt.getTime() > Date.now() ? "scheduled" : "running";
  await db.transaction(async (transaction) => {
    await transaction.insert(campaigns).values({ id: campaignId, organizationId, whatsappAccountId: parsed.whatsappAccountId, templateId: parsed.templateId, createdBy: userId, name: parsed.name, status, scheduledAt, startedAt: status === "running" ? new Date() : null, totalRecipients: uniqueContactIds.length });
    for (let offset = 0; offset < uniqueContactIds.length; offset += 500) {
      const batch = uniqueContactIds.slice(offset, offset + 500);
      await transaction.insert(campaignRecipients).values(batch.map((contactId) => ({ id: generateId(), campaignId, contactId, variables: parsed.variables[contactId] ?? {}, status: "pending" as const })));
    }
  });
  const recipients = await db.select({ id: campaignRecipients.id }).from(campaignRecipients).where(eq(campaignRecipients.campaignId, campaignId));
  for (const recipient of recipients) {
    await enqueueJob({ organizationId, type: "campaign_recipient.send", payload: { organizationId, campaignId, recipientId: recipient.id }, runAt: scheduledAt ?? new Date() });
  }
  return getCampaign(organizationId, campaignId);
}

export async function getCampaignStats(organizationId: string, campaignId: string) {
  await getCampaign(organizationId, campaignId);
  return db.select({ status: campaignRecipients.status, total: count() }).from(campaignRecipients).where(eq(campaignRecipients.campaignId, campaignId)).groupBy(campaignRecipients.status);
}

export async function processCampaignRecipientJob(input: { organizationId: string; campaignId: string; recipientId: string }): Promise<void> {
  const campaign = await getCampaign(input.organizationId, input.campaignId);
  if (campaign.status === "scheduled") {
    await db.update(campaigns).set({ status: "running", startedAt: new Date(), updatedAt: new Date() }).where(eq(campaigns.id, campaign.id));
  } else if (campaign.status !== "running") {
    throw new AppError("CONFLICT", "Campaign is not running", 409);
  }
  const recipientRows = await db.select().from(campaignRecipients).where(and(eq(campaignRecipients.id, input.recipientId), eq(campaignRecipients.campaignId, campaign.id))).limit(1);
  const recipient = recipientRows[0];
  if (!recipient || !["pending", "failed"].includes(recipient.status)) return;
  const contactRows = await db.select().from(contacts).where(and(eq(contacts.id, recipient.contactId), eq(contacts.organizationId, campaign.organizationId), isNull(contacts.deletedAt))).limit(1);
  const contact = contactRows[0];
  if (!contact) throw new AppError("NOT_FOUND", "Campaign contact no longer exists", 404);
  const { template, components } = await getTemplateForCampaign(campaign.organizationId, campaign.templateId);
  const variables = recipient.variables;
  const renderedComponents = components.map((component) => replaceVariables({ type: component.type, text: { body: component.content } }, variables));
  const messageInput: SendMessageInput = { whatsappAccountId: campaign.whatsappAccountId, to: contact.phoneNumber, type: "template", template: { name: template.name, language: template.language, components: renderedComponents as Array<Record<string, unknown>> } };
  await db.update(campaignRecipients).set({ status: "sending", updatedAt: new Date() }).where(eq(campaignRecipients.id, recipient.id));
  try {
    const message = await sendTenantMessage(campaign.organizationId, messageInput);
    await db.update(campaignRecipients).set({ status: "sent", externalMessageId: message.externalId, sentAt: new Date(), updatedAt: new Date() }).where(eq(campaignRecipients.id, recipient.id));
    await db.update(campaigns).set({ sentCount: sql`${campaigns.sentCount} + 1`, updatedAt: new Date() }).where(eq(campaigns.id, campaign.id));
    const remaining = await db.select({ total: count() }).from(campaignRecipients).where(and(eq(campaignRecipients.campaignId, campaign.id), inArray(campaignRecipients.status, ["pending", "sending"])));
    if ((remaining[0]?.total ?? 0) === 0) {
      await db.update(campaigns).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(eq(campaigns.id, campaign.id));
      await notifyWorkspaceMembers({ organizationId: campaign.organizationId, type: "campaign_completed", title: "Campaign completed", body: `${campaign.name} finished processing.`, metadata: { campaignId: campaign.id } });
      await dispatchTenantEvent({ organizationId: campaign.organizationId, eventType: "campaign.completed", payload: { campaignId: campaign.id, name: campaign.name } });
    }
  } catch (error) {
    await db.update(campaignRecipients).set({ status: "failed", errorCode: "SEND_FAILED", errorMessage: error instanceof Error ? error.message : "Message failed", failedAt: new Date(), updatedAt: new Date() }).where(eq(campaignRecipients.id, recipient.id));
    throw error;
  }
}

export async function pauseCampaign(organizationId: string, campaignId: string): Promise<void> {
  const campaign = await getCampaign(organizationId, campaignId);
  if (["completed", "cancelled"].includes(campaign.status)) throw new AppError("CONFLICT", "Campaign cannot be paused", 409);
  await db.update(campaigns).set({ status: "paused", updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
}

export async function cancelCampaign(organizationId: string, campaignId: string): Promise<void> {
  const campaign = await getCampaign(organizationId, campaignId);
  if (campaign.status === "completed") throw new AppError("CONFLICT", "Completed campaigns cannot be cancelled", 409);
  await db.update(campaigns).set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
}

export async function retryFailedCampaign(organizationId: string, campaignId: string): Promise<void> {
  const campaign = await getCampaign(organizationId, campaignId);
  if (!["paused", "failed", "completed"].includes(campaign.status)) throw new AppError("CONFLICT", "Campaign cannot be retried", 409);
  const failed = await db.select().from(campaignRecipients).where(and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, "failed")));
  for (const recipient of failed) {
    await db.update(campaignRecipients).set({ status: "pending", errorCode: null, errorMessage: null, failedAt: null, updatedAt: new Date() }).where(eq(campaignRecipients.id, recipient.id));
    await enqueueJob({ organizationId, type: "campaign_recipient.send", payload: { organizationId, campaignId, recipientId: recipient.id } });
  }
  await db.update(campaigns).set({ status: "running", completedAt: null, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
}
