"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspaceRole } from "@/lib/auth/tenant";
import { recordAudit } from "@/lib/security/audit";
import { AppError, toAppError } from "@/lib/errors";
import { createTemplate, deleteTemplate, duplicateTemplate, refreshTemplateStatuses } from "@/services/templates/templates";

export type TemplateActionState = { error?: string; success?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function actionError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Check the template details";
  return toAppError(error).message;
}

function variablesFor(...values: string[]): string[] {
  const variables = new Set<number>();
  for (const value of values) {
    for (const match of value.matchAll(/\{\{(\d+)\}\}/g)) variables.add(Number(match[1]));
  }
  return [...variables].sort((left, right) => left - right).map((number) => `{{${number}}}`);
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
    if (buttons) components.push({ type: "BUTTONS" as const, content: buttons, metadata: { buttons: buttons.split("\n").map((label) => label.trim()).filter(Boolean).map((label) => ({ type: "QUICK_REPLY", text: label })) } });
    await createTemplate(context.organization.id, { whatsappAccountId: text(formData, "whatsappAccountId"), name: text(formData, "name"), language: text(formData, "language"), category: text(formData, "category") as "MARKETING" | "UTILITY" | "AUTHENTICATION", components, variables: variablesFor(header, body) });
    await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "template.created", resource: "template" });
    revalidatePath("/dashboard/templates");
    return { success: "Template submitted to Meta" };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function syncTemplatesAction(_previousState: TemplateActionState, formData: FormData): Promise<TemplateActionState> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  const accountId = text(formData, "whatsappAccountId");
  if (!accountId) return { error: "Select a WhatsApp account first" };
  try {
    await refreshTemplateStatuses(context.organization.id, accountId);
    revalidatePath("/dashboard/templates");
    return { success: "Templates synced from Meta" };
  } catch (error) {
    return { error: actionError(error) };
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
