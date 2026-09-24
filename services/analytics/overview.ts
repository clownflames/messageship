import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, contacts, conversations, messages, whatsappAccounts } from "@/db/schema";

export type DashboardOverview = {
  messages: { total: number; sent: number; delivered: number; read: number; failed: number };
  conversations: number;
  contacts: number;
  campaigns: number;
  connectedAccounts: number;
  recentConversations: Array<{
    id: string;
    contactName: string;
    phoneNumber: string;
    lastMessagePreview: string | null;
    lastMessageAt: Date | null;
    unreadCount: number;
  }>;
};

export async function getDashboardOverview(organizationId: string): Promise<DashboardOverview> {
  const [messageCounts, conversationCount, contactCount, campaignCount, accountCount, recent] = await Promise.all([
    db.select({ status: messages.status, total: count() }).from(messages).where(eq(messages.organizationId, organizationId)).groupBy(messages.status),
    db.select({ total: count() }).from(conversations).where(and(eq(conversations.organizationId, organizationId), isNull(conversations.deletedAt))),
    db.select({ total: count() }).from(contacts).where(and(eq(contacts.organizationId, organizationId), isNull(contacts.deletedAt))),
    db.select({ total: count() }).from(campaigns).where(eq(campaigns.organizationId, organizationId)),
    db.select({ total: count() }).from(whatsappAccounts).where(and(eq(whatsappAccounts.organizationId, organizationId), isNull(whatsappAccounts.deletedAt), eq(whatsappAccounts.status, "connected"))),
    db.select({ id: conversations.id, contactName: contacts.name, phoneNumber: contacts.phoneNumber, lastMessagePreview: conversations.lastMessagePreview, lastMessageAt: conversations.lastMessageAt, unreadCount: conversations.unreadCount })
      .from(conversations)
      .innerJoin(contacts, eq(conversations.contactId, contacts.id))
      .where(and(eq(conversations.organizationId, organizationId), isNull(conversations.deletedAt)))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(6),
  ]);
  const byStatus = new Map(messageCounts.map((row) => [row.status, row.total]));
  return {
    messages: {
      total: messageCounts.reduce((sum, row) => sum + row.total, 0),
      sent: byStatus.get("sent") ?? 0,
      delivered: byStatus.get("delivered") ?? 0,
      read: byStatus.get("read") ?? 0,
      failed: byStatus.get("failed") ?? 0,
    },
    conversations: conversationCount[0]?.total ?? 0,
    contacts: contactCount[0]?.total ?? 0,
    campaigns: campaignCount[0]?.total ?? 0,
    connectedAccounts: accountCount[0]?.total ?? 0,
    recentConversations: recent,
  };
}
