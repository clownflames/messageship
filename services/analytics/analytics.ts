import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { messages, usageRecords } from "@/db/schema";

export type AnalyticsSnapshot = {
  daily: Array<{ date: string; total: number; inbound: number; outbound: number }>;
  byType: Array<{ type: string; total: number }>;
  byStatus: Array<{ status: string; total: number }>;
  usage: Array<{ type: string; total: number }>;
};

export async function getAnalytics(organizationId: string, days = 30): Promise<AnalyticsSnapshot> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [daily, byType, byStatus, usage] = await Promise.all([
    db.select({ date: sql<string>`to_char(date_trunc('day', ${messages.createdAt}), 'YYYY-MM-DD')`, total: sql<number>`count(*)`, inbound: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')`, outbound: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')` }).from(messages).where(and(eq(messages.organizationId, organizationId), gte(messages.createdAt, since))).groupBy(sql`date_trunc('day', ${messages.createdAt})`).orderBy(sql`date_trunc('day', ${messages.createdAt})`),
    db.select({ type: messages.type, total: sql<number>`count(*)` }).from(messages).where(and(eq(messages.organizationId, organizationId), gte(messages.createdAt, since))).groupBy(messages.type),
    db.select({ status: messages.status, total: sql<number>`count(*)` }).from(messages).where(and(eq(messages.organizationId, organizationId), gte(messages.createdAt, since))).groupBy(messages.status),
    db.select({ type: usageRecords.type, total: sql<number>`sum(${usageRecords.quantity})` }).from(usageRecords).where(and(eq(usageRecords.organizationId, organizationId), gte(usageRecords.createdAt, since))).groupBy(usageRecords.type),
  ]);
  return { daily, byType, byStatus, usage };
}
