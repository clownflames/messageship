import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications, organizationMembers, type Notification } from "@/db/schema";
import { generateId } from "@/lib/security/crypto";
import type { JsonValue } from "@/db/schema";

export async function createNotification(input: { organizationId: string; userId?: string | null; type: "campaign_completed" | "campaign_failed" | "connection_problem" | "webhook_error" | "api_error" | "template_status" | "automation_error"; title: string; body: string; metadata?: JsonValue }): Promise<Notification> {
  const inserted = await db.insert(notifications).values({ id: generateId(), organizationId: input.organizationId, userId: input.userId ?? null, type: input.type, title: input.title, body: input.body, metadata: input.metadata ?? {} }).returning();
  const notification = inserted[0];
  if (!notification) throw new Error("Notification could not be created");
  return notification;
}

export async function notifyWorkspaceMembers(input: { organizationId: string; type: "campaign_completed" | "campaign_failed" | "connection_problem" | "webhook_error" | "api_error" | "template_status" | "automation_error"; title: string; body: string; metadata?: JsonValue }): Promise<void> {
  const members = await db.select({ userId: organizationMembers.userId }).from(organizationMembers).where(eq(organizationMembers.organizationId, input.organizationId));
  for (const member of members) await createNotification({ ...input, userId: member.userId });
}

export async function listNotifications(organizationId: string, userId: string): Promise<Notification[]> {
  return db.select().from(notifications).where(and(eq(notifications.organizationId, organizationId), eq(notifications.userId, userId), isNull(notifications.readAt))).orderBy(desc(notifications.createdAt)).limit(50);
}

export async function markNotificationRead(organizationId: string, userId: string, notificationId: string): Promise<void> {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, notificationId), eq(notifications.organizationId, organizationId), eq(notifications.userId, userId)));
}
