"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceRole } from "@/lib/auth/tenant";
import { recordAudit } from "@/lib/security/audit";
import { AppError } from "@/lib/errors";
import { cancelCampaign, createCampaign, pauseCampaign, retryFailedCampaign } from "@/services/campaigns/campaigns";

export type CampaignActionState = { error?: string; success?: string };

function value(formData: FormData, key: string): string { return String(formData.get(key) ?? "").trim(); }

export async function createCampaignAction(_previousState: CampaignActionState, formData: FormData): Promise<CampaignActionState> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  try {
    let variables: Record<string, Record<string, string>> = {};
    const rawVariables = value(formData, "variables");
    if (rawVariables) variables = JSON.parse(rawVariables) as Record<string, Record<string, string>>;
    const scheduledValue = value(formData, "scheduledAt");
    const campaign = await createCampaign(context.organization.id, context.user.id, { name: value(formData, "name"), whatsappAccountId: value(formData, "whatsappAccountId"), templateId: value(formData, "templateId"), contactIds: formData.getAll("contactIds").map(String), variables, scheduledAt: scheduledValue ? new Date(scheduledValue).toISOString() : undefined });
    await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "campaign.created", resource: "campaign", resourceId: campaign.id });
    revalidatePath("/dashboard/campaigns");
    return { success: "Campaign queued" };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    if (error instanceof SyntaxError) return { error: "Variables must be valid JSON" };
    throw error;
  }
}

export async function campaignAction(formData: FormData): Promise<void> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  const campaignId = value(formData, "campaignId");
  const action = value(formData, "action");
  if (!campaignId) throw new AppError("INVALID_REQUEST", "Campaign id is required", 400);
  if (action === "pause") await pauseCampaign(context.organization.id, campaignId);
  if (action === "cancel") await cancelCampaign(context.organization.id, campaignId);
  if (action === "retry_failed") await retryFailedCampaign(context.organization.id, campaignId);
  await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: `campaign.${action}`, resource: "campaign", resourceId: campaignId });
  revalidatePath("/dashboard/campaigns");
}
