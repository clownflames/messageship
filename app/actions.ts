"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { organizationMembers, organizations } from "@/db/schema";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/security/audit";
import { generateId } from "@/lib/security/crypto";
import { requireSession, setActiveWorkspace } from "@/lib/auth/tenant";
import { workspaceSchema } from "@/lib/validation/schemas";
import { forbidden } from "@/lib/errors";

export type WorkspaceActionState = { error?: string };

export async function createWorkspaceAction(_previousState: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
  const user = await requireSession();
  const parsed = workspaceSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a workspace name" };
  }
  const existing = await db.select({ id: organizations.id })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(eq(organizationMembers.userId, user.id), isNull(organizations.deletedAt)))
    .limit(1);
  if (existing[0]) {
    return { error: "You already have a workspace. Switch to it from the workspace menu." };
  }
  const organizationId = generateId();
  const baseSlug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, fortyEight) || "workspace";
  await db.transaction(async (transaction) => {
    await transaction.insert(organizations).values({ id: organizationId, name: parsed.data.name, slug: `${baseSlug}-${organizationId.slice(0, 8)}` });
    await transaction.insert(organizationMembers).values({ id: generateId(), organizationId, userId: user.id, role: "owner" });
  });
  await setActiveWorkspace(organizationId, user.id);
  await recordAudit({ organizationId, userId: user.id, action: "workspace.created", resource: "workspace", resourceId: organizationId });
  redirect("/dashboard");
}

const fortyEight = 48;

export async function switchWorkspaceAction(formData: FormData): Promise<void> {
  const user = await requireSession();
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!organizationId) {
    throw forbidden("A workspace is required");
  }
  await setActiveWorkspace(organizationId, user.id);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
