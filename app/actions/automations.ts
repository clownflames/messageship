"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceRole } from "@/lib/auth/tenant";
import { recordAudit } from "@/lib/security/audit";
import { AppError } from "@/lib/errors";
import { automationSchema } from "@/lib/validation/schemas";
import { createAutomation, deleteAutomation, setAutomationEnabled } from "@/services/automation/automations";

export type AutomationActionState = { error?: string; success?: string; triggerSecret?: string };

function value(formData: FormData, key: string): string { return String(formData.get(key) ?? "").trim(); }

export async function createAutomationAction(_previousState: AutomationActionState, formData: FormData): Promise<AutomationActionState> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  try {
    const nodes = JSON.parse(value(formData, "nodes")) as unknown;
    const edges = JSON.parse(value(formData, "edges") || "[]") as unknown;
    const result = await createAutomation(context.organization.id, context.user.id, automationSchema.parse({ name: value(formData, "name"), description: value(formData, "description") || undefined, whatsappAccountId: value(formData, "whatsappAccountId") || undefined, trigger: { type: "incoming_message" }, nodes, edges, enabled: value(formData, "enabled") === "true" }));
    await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "automation.created", resource: "automation", resourceId: result.id });
    revalidatePath("/dashboard/automations");
    return { success: "Automation created", triggerSecret: result.triggerSecret };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    if (error instanceof SyntaxError) return { error: "Workflow definition is not valid JSON" };
    throw error;
  }
}

export async function toggleAutomationAction(formData: FormData): Promise<void> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  const automationId = value(formData, "automationId");
  if (!automationId) throw new AppError("INVALID_REQUEST", "Automation id is required", 400);
  await setAutomationEnabled(context.organization.id, automationId, value(formData, "enabled") === "true");
  revalidatePath("/dashboard/automations");
}

export async function deleteAutomationAction(formData: FormData): Promise<void> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  const automationId = value(formData, "automationId");
  if (!automationId) throw new AppError("INVALID_REQUEST", "Automation id is required", 400);
  await deleteAutomation(context.organization.id, automationId);
  revalidatePath("/dashboard/automations");
}
