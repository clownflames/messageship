"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceRole } from "@/lib/auth/tenant";
import { recordAudit } from "@/lib/security/audit";
import { AppError } from "@/lib/errors";
import { createTemplate, deleteTemplate, duplicateTemplate, refreshTemplateStatuses } from "@/services/templates/templates";

export type TemplateActionState = { error?: string; success?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createTemplateAction(_previousState: TemplateActionState, formData: FormData): Promise<TemplateActionState> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  try {
    const components = [];
    const header = text(formData, "header");
    const body = text(formData, "body");
    const footer = text(formData, "footer");
    const buttons = text(formData, "buttons");
    if (header) components.push({ type: "HEADER" as const, content: header, metadata: {} });
    if (body) components.push({ type: "BODY" as const, content: body, metadata: {} });
    if (footer) components.push({ type: "FOOTER" as const, content: footer, metadata: {} });
    if (buttons) components.push({ type: "BUTTONS" as const, content: buttons, metadata: { buttons: buttons.split("\n").filter(Boolean).map((label) => ({ type: "QUICK_REPLY", text: label })) } });
    await createTemplate(context.organization.id, { whatsappAccountId: text(formData, "whatsappAccountId"), name: text(formData, "name"), language: text(formData, "language"), category: text(formData, "category") as "MARKETING" | "UTILITY" | "AUTHENTICATION", components, variables: Array.from(new Set((body.match(/\{\{\d+\}\}/g) ?? []))) });
    await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "template.created", resource: "template" });
    revalidatePath("/dashboard/templates");
    return { success: "Template submitted to Meta" };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  const templateId = text(formData, "templateId");
  if (!templateId) throw new AppError("INVALID_REQUEST", "Template id is required", 400);
  await deleteTemplate(context.organization.id, templateId);
  await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "template.deleted", resource: "template", resourceId: templateId });
  revalidatePath("/dashboard/templates");
}

export async function refreshTemplatesAction(formData: FormData): Promise<void> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  const accountId = text(formData, "whatsappAccountId");
  if (!accountId) throw new AppError("INVALID_REQUEST", "Account id is required", 400);
  await refreshTemplateStatuses(context.organization.id, accountId);
  revalidatePath("/dashboard/templates");
}

export async function duplicateTemplateAction(formData: FormData): Promise<void> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  const templateId = text(formData, "templateId");
  const name = text(formData, "name");
  if (!templateId || !name) throw new AppError("INVALID_REQUEST", "Template id and new name are required", 400);
  await duplicateTemplate(context.organization.id, templateId, name);
  revalidatePath("/dashboard/templates");
}
