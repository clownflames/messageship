"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceRole } from "@/lib/auth/tenant";
import { recordAudit } from "@/lib/security/audit";
import { AppError } from "@/lib/errors";
import { createAIProvider, deleteAIProvider, updateAIProvider } from "@/services/ai/providers";

export type AiActionState = { error?: string; success?: string };

function value(formData: FormData, key: string): string { return String(formData.get(key) ?? "").trim(); }

export async function createAIProviderAction(_previousState: AiActionState, formData: FormData): Promise<AiActionState> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  try {
    const model = value(formData, "model");
    await createAIProvider(context.organization.id, context.user.id, { name: value(formData, "name"), kind: value(formData, "kind") as "openai" | "deepseek" | "anthropic" | "gemini" | "openrouter" | "ollama" | "openai_compatible", apiKey: value(formData, "apiKey") || undefined, baseUrl: value(formData, "baseUrl") || undefined, models: model ? [{ model, displayName: model }] : [], enabled: true });
    await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "ai_provider.created", resource: "ai_provider" });
    revalidatePath("/dashboard/ai");
    return { success: "AI provider saved securely" };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
}

export async function toggleAIProviderAction(formData: FormData): Promise<void> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  const providerId = value(formData, "providerId");
  if (!providerId) throw new AppError("INVALID_REQUEST", "Provider id is required", 400);
  await updateAIProvider(context.organization.id, providerId, { enabled: value(formData, "enabled") === "true" });
  revalidatePath("/dashboard/ai");
}

export async function deleteAIProviderAction(formData: FormData): Promise<void> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  const providerId = value(formData, "providerId");
  if (!providerId) throw new AppError("INVALID_REQUEST", "Provider id is required", 400);
  await deleteAIProvider(context.organization.id, providerId);
  revalidatePath("/dashboard/ai");
}
