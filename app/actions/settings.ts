"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceRole } from "@/lib/auth/tenant";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { workspaceSchema } from "@/lib/validation/schemas";
import { recordAudit } from "@/lib/security/audit";
import { AppError } from "@/lib/errors";

export async function updateWorkspaceAction(_previousState: { error?: string; success?: string }, formData: FormData): Promise<{ error?: string; success?: string }> {
  const context = await requireWorkspaceRole(["owner", "admin"]);
  const parsed = workspaceSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a workspace name" };
  const updated = await db.update(organizations).set({ name: parsed.data.name, updatedAt: new Date() }).where(and(eq(organizations.id, context.organization.id), isNull(organizations.deletedAt))).returning({ id: organizations.id });
  if (!updated[0]) throw new AppError("NOT_FOUND", "Workspace not found", 404);
  await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "workspace.updated", resource: "workspace", resourceId: context.organization.id });
  revalidatePath("/dashboard/settings");
  return { success: "Workspace settings saved" };
}
