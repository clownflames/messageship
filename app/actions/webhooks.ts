"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceRole } from "@/lib/auth/tenant";
import { recordAudit } from "@/lib/security/audit";
import { AppError } from "@/lib/errors";
import { webhookSchema } from "@/lib/validation/schemas";
import { createWebhook, deleteWebhook } from "@/services/webhooks/webhooks";

export type WebhookActionState = { error?: string; success?: string; secret?: string };

function value(formData: FormData, key: string): string { return String(formData.get(key) ?? "").trim(); }

export async function createWebhookAction(_previousState: WebhookActionState, formData: FormData): Promise<WebhookActionState> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  try {
    const parsed = webhookSchema.safeParse({ name: value(formData, "name"), url: value(formData, "url"), events: formData.getAll("events").map(String), enabled: true });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose at least one event" };
    const result = await createWebhook(context.organization.id, context.user.id, parsed.data);
    await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "webhook.created", resource: "webhook", resourceId: result.webhook.id });
    revalidatePath("/dashboard/developer/webhooks");
    return { success: "Webhook created", secret: result.secret };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
}

export async function deleteWebhookAction(formData: FormData): Promise<void> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  const webhookId = value(formData, "webhookId");
  if (!webhookId) throw new AppError("INVALID_REQUEST", "Webhook id is required", 400);
  await deleteWebhook(context.organization.id, webhookId);
  revalidatePath("/dashboard/developer/webhooks");
}
