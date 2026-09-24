import { and, eq, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { assertDatabaseConfigured, db } from "@/db";
import { organizationMembers, organizations, type Organization, type OrganizationMember } from "@/db/schema";
import { auth } from "@/lib/auth";
import { forbidden, unauthorized } from "@/lib/errors";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
};

export type WorkspaceContext = {
  user: AuthenticatedUser;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
  organization: Organization;
  membership: OrganizationMember;
};

export async function getSession() {
  assertDatabaseConfigured();
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession(): Promise<AuthenticatedUser> {
  const result = await getSession();
  if (!result?.user) {
    throw unauthorized();
  }
  return {
    id: result.user.id,
    name: result.user.name,
    email: result.user.email,
    emailVerified: result.user.emailVerified,
    image: result.user.image ?? null,
  };
}

export async function listWorkspaces(userId: string): Promise<Array<{ organization: Organization; membership: OrganizationMember }>> {
  const rows = await db.select({ organization: organizations, membership: organizationMembers })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(eq(organizationMembers.userId, userId), isNull(organizations.deletedAt)));
  return rows;
}

export async function getCurrentWorkspace(userId: string): Promise<WorkspaceContext["organization"] | null> {
  const cookieStore = await cookies();
  const requestedId = cookieStore.get("messageship_workspace_id")?.value;
  const available = await listWorkspaces(userId);
  if (available.length === 0) {
    return null;
  }
  return available.find(({ organization }) => organization.id === requestedId)?.organization ?? available[0].organization;
}

export async function requireWorkspace(): Promise<WorkspaceContext> {
  const user = await requireSession();
  const result = await getSession();
  if (!result?.session) {
    throw unauthorized();
  }
  const cookieStore = await cookies();
  const requestedId = cookieStore.get("messageship_workspace_id")?.value;
  const memberships = await listWorkspaces(user.id);
  const selected = memberships.find(({ organization }) => organization.id === requestedId) ?? memberships[0];
  if (!selected) {
    throw forbidden("You do not belong to a workspace");
  }
  return {
    user,
    session: {
      id: result.session.id,
      userId: result.session.userId,
      expiresAt: result.session.expiresAt,
    },
    organization: selected.organization,
    membership: selected.membership,
  };
}

export async function requireWorkspaceRole(roles: Array<OrganizationMember["role"]>): Promise<WorkspaceContext> {
  const context = await requireWorkspace();
  if (!roles.includes(context.membership.role)) {
    throw forbidden("Your workspace role cannot perform this action");
  }
  return context;
}

export async function setActiveWorkspace(organizationId: string, userId: string): Promise<void> {
  const membership = await db.select({ id: organizationMembers.id })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, organizationId), isNull(organizations.deletedAt)))
    .limit(1);
  if (!membership[0]) {
    throw forbidden("You cannot access that workspace");
  }
  const cookieStore = await cookies();
  cookieStore.set("messageship_workspace_id", organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
