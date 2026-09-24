"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceRole } from "@/lib/auth/tenant";
import { recordAudit } from "@/lib/security/audit";
import { AppError } from "@/lib/errors";
import { createContact, deleteContact, importContacts, previewContactImport } from "@/services/contacts/contacts";

export type ContactActionState = { error?: string; success?: string; preview?: Awaited<ReturnType<typeof previewContactImport>> };

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createContactAction(_previousState: ContactActionState, formData: FormData): Promise<ContactActionState> {
  const context = await requireWorkspaceRole(["owner", "admin", "member"]);
  try {
    await createContact(context.organization.id, { name: value(formData, "name"), phoneNumber: value(formData, "phoneNumber"), email: value(formData, "email"), notes: value(formData, "notes") || undefined, tags: value(formData, "tags").split(",").map((tag) => tag.trim()).filter(Boolean) });
    await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "contact.created", resource: "contact" });
    revalidatePath("/dashboard/contacts");
    return { success: "Contact added" };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
}

export async function previewContactsAction(_previousState: ContactActionState, formData: FormData): Promise<ContactActionState> {
  const context = await requireWorkspaceRole(["owner", "admin", "member"]);
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a CSV file" };
  try {
    const preview = await previewContactImport(context.organization.id, await file.text());
    return { preview };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
}

export async function importContactsAction(_previousState: ContactActionState, formData: FormData): Promise<ContactActionState> {
  const context = await requireWorkspaceRole(["owner", "admin", "member"]);
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a CSV file" };
  try {
    const result = await importContacts(context.organization.id, await file.text());
    revalidatePath("/dashboard/contacts");
    return { success: `${result.imported} contacts imported${result.skipped ? `, ${result.skipped} skipped` : ""}` };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
}

export async function deleteContactAction(formData: FormData): Promise<void> {
  const context = await requireWorkspaceRole(["owner", "admin", "member"]);
  const contactId = value(formData, "contactId");
  if (!contactId) throw new AppError("INVALID_REQUEST", "Contact id is required", 400);
  await deleteContact(context.organization.id, contactId);
  await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "contact.deleted", resource: "contact", resourceId: contactId });
  revalidatePath("/dashboard/contacts");
}
