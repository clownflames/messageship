import type { Metadata } from "next";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { templates } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/tenant";
import { listWhatsappAccounts } from "@/services/whatsapp/accounts";
import { getConversationPolicy, listTenantConversations, listTenantMessages } from "@/services/whatsapp/messages";
import { InboxShell } from "@/components/inbox/inbox-shell";
import type { InboxConversation, InboxMessage, InboxTemplate } from "@/lib/inbox/types";

export const metadata: Metadata = { title: "Inbox | MessageShip" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ conversationId?: string; accountId?: string }> }) {
  const context = await requireWorkspace();
  const params = await searchParams;
  let conversations: Awaited<ReturnType<typeof listTenantConversations>> = [];
  let accounts: Awaited<ReturnType<typeof listWhatsappAccounts>> = [];
  let templateRows: Array<{ id: string; name: string; language: string; category: string; status: string }> = [];
  try {
    [conversations, accounts, templateRows] = await Promise.all([
      listTenantConversations(context.organization.id, { accountId: params.accountId }),
      listWhatsappAccounts(context.organization.id),
      db.select({ id: templates.id, name: templates.name, language: templates.language, category: templates.category, status: templates.status }).from(templates).where(and(eq(templates.organizationId, context.organization.id), eq(templates.status, "approved"), isNull(templates.deletedAt))),
    ]);
  } catch {
    conversations = [];
  }
  const selectedId = params.conversationId && conversations.some((item) => item.id === params.conversationId) ? params.conversationId : conversations[0]?.id;
  const selectedMessages: InboxMessage[] = [];
  if (selectedId) {
    try {
      const rows = await listTenantMessages(context.organization.id, selectedId);
      selectedMessages.push(...rows.reverse().map((message) => ({ id: message.id, conversationId: message.conversationId, direction: message.direction, type: message.type, status: message.status, body: message.body, createdAt: message.createdAt.toISOString(), errorMessage: message.errorMessage })));
    } catch {
      selectedMessages.length = 0;
    }
  }
  const inboxConversations: InboxConversation[] = await Promise.all(conversations.map(async (conversation) => {
    const policy = await getConversationPolicy(context.organization.id, conversation.whatsappAccountId, conversation.contactId);
    return { id: conversation.id, accountId: conversation.whatsappAccountId, contactId: conversation.contactId, contactName: conversation.contactName, phoneNumber: conversation.phoneNumber, lastMessagePreview: conversation.lastMessagePreview, lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null, unreadCount: conversation.unreadCount, starred: conversation.starred, archived: conversation.archived, freeFormAllowed: policy.canSendFreeForm, policyMessage: policy.reasonMessage };
  }));
  const inboxTemplates: InboxTemplate[] = templateRows.map((template) => ({ id: template.id, name: template.name, language: template.language, category: template.category, status: template.status }));
  return <InboxShell initialConversations={inboxConversations} initialMessages={selectedMessages} initialSelectedId={selectedId ?? null} accounts={accounts.map((account) => ({ id: account.id, name: account.name }))} templates={inboxTemplates} />;
}
