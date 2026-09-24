"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceRole } from "@/lib/auth/tenant";
import { recordAudit } from "@/lib/security/audit";
import { AppError } from "@/lib/errors";
import { whatsappAccountConnectionSchema } from "@/lib/validation/schemas";
import { connectWhatsappAccount, disconnectWhatsappAccount, refreshWhatsappAccount } from "@/services/whatsapp/accounts";

export type WhatsappAccountActionState = { error?: string; success?: string };

export async function connectWhatsappAccountAction(_previousState: WhatsappAccountActionState, formData: FormData): Promise<WhatsappAccountActionState> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  const parsed = whatsappAccountConnectionSchema.safeParse({
    name: formData.get("name"),
    businessName: formData.get("businessName") || undefined,
    businessId: formData.get("businessId"),
    wabaId: formData.get("wabaId"),
    phoneNumberId: formData.get("phoneNumberId"),
    accessToken: formData.get("accessToken"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the account details" };
  try {
    await connectWhatsappAccount(context.organization.id, parsed.data);
    await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "whatsapp_account.connected", resource: "whatsapp_account" });
    revalidatePath("/dashboard/whatsapp");
    return { success: "WhatsApp account connected" };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
}

export async function disconnectWhatsappAccountAction(formData: FormData): Promise<void> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) throw new AppError("INVALID_REQUEST", "Account id is required", 400);
  await disconnectWhatsappAccount(context.organization.id, accountId);
  await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "whatsapp_account.disconnected", resource: "whatsapp_account", resourceId: accountId });
  revalidatePath("/dashboard/whatsapp");
}

export async function refreshWhatsappAccountAction(formData: FormData): Promise<void> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) throw new AppError("INVALID_REQUEST", "Account id is required", 400);
  await refreshWhatsappAccount(context.organization.id, accountId);
  await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "whatsapp_account.metadata_refreshed", resource: "whatsapp_account", resourceId: accountId });
  revalidatePath("/dashboard/whatsapp");
}
