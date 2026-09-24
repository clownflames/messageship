import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { organizationMembers, organizations, type Organization } from "@/db/schema";
import { generateId } from "@/lib/security/crypto";

const fortyEight = 48;

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, fortyEight) || "workspace";
}

export async function ensureWorkspaceForUser(userId: string, email: string, displayName: string): Promise<Organization> {
  const existingMembership = await db.select({ organization: organizations })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(eq(organizationMembers.userId, userId), isNull(organizations.deletedAt)))
    .limit(1);
  const existing = existingMembership[0]?.organization;
  if (existing) {
    return existing;
  }

  const baseName = displayName.trim() || email.split("@")[0] || "Workspace";
  const slug = `${slugify(baseName)}-${userId.slice(0, 8)}`;
  const organizationId = generateId();
  const inserted = await db.transaction(async (transaction) => {
    const organizationRows = await transaction.insert(organizations).values({
      id: organizationId,
      name: baseName,
      slug,
    }).returning();
    const organization = organizationRows[0];
    if (!organization) {
      throw new Error("Workspace could not be created");
    }
    await transaction.insert(organizationMembers).values({
      id: generateId(),
      organizationId: organization.id,
      userId,
      role: "owner",
    });
    return organization;
  });
  return inserted;
}
