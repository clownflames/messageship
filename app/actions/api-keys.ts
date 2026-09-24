"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceRole } from "@/lib/auth/tenant";
import { recordAudit } from "@/lib/security/audit";
import { AppError } from "@/lib/errors";
import { apiKeyCreateSchema } from "@/lib/validation/schemas";
import { createApiKey, revokeApiKey } from "@/services/api/keys";

export type ApiKeyActionState = { error?: string; success?: string; rawKey?: string };

export async function createApiKeyAction(_previousState: ApiKeyActionState, formData: FormData): Promise<ApiKeyActionState> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  try {
    const parsed = apiKeyCreateSchema.safeParse({ name: String(formData.get("name") ?? ""), scopes: formData.getAll("scopes").map(String), expiresAt: String(formData.get("expiresAt") ?? "") || undefined });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Select at least one scope" };
    const result = await createApiKey(context.organization.id, context.user.id, parsed.data);
    await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "api_key.created", resource: "api_key", resourceId: result.apiKey.id });
    revalidatePath("/dashboard/developer/api-keys");
    return { success: "API key created", rawKey: result.rawKey };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  const keyId = String(formData.get("keyId") ?? "");
  if (!keyId) throw new AppError("INVALID_REQUEST", "API key id is required", 400);
  await revokeApiKey(context.organization.id, keyId);
  await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "api_key.revoked", resource: "api_key", resourceId: keyId });
  revalidatePath("/dashboard/developer/api-keys");
}
