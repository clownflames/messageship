import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BarChart3, ContactRound, Inbox, MessageSquareText, Send, UsersRound } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/tenant";
import { getDashboardOverview } from "@/services/analytics/overview";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview | MessageShip" };

function formatRelative(value: Date | null): string {
  if (!value) return "No messages yet";
  const seconds = Math.max(0, Math.floor((Date.now() - value.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const statusRows = [
  { key: "sent", label: "Sent", color: "bg-blue-500" },
  { key: "delivered", label: "Delivered", color: "bg-emerald-500" },
  { key: "read", label: "Read", color: "bg-violet-500" },
  { key: "failed", label: "Failed", color: "bg-rose-500" },
] as const;

export default async function DashboardPage() {
  const context = await requireWorkspace();
  let overview: Awaited<ReturnType<typeof getDashboardOverview>>;
  try {
    overview = await getDashboardOverview(context.organization.id);
  } catch {
    overview = { messages: { total: 0, sent: 0, delivered: 0, read: 0, failed: 0 }, conversations: 0, contacts: 0, campaigns: 0, connectedAccounts: 0, recentConversations: [] };
  }
  const cards = [
    { label: "Total messages", value: overview.messages.total, detail: `${overview.messages.sent} sent`, icon: MessageSquareText, href: "/dashboard/inbox" },
    { label: "Open conversations", value: overview.conversations, detail: `${overview.contacts} contacts`, icon: Inbox, href: "/dashboard/inbox" },
    { label: "Contacts", value: overview.contacts, detail: "Across all accounts", icon: ContactRound, href: "/dashboard/contacts" },
    { label: "Campaigns", value: overview.campaigns, detail: "All time", icon: Send, href: "/dashboard/campaigns" },
  ];
  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">{context.organization.name}</p><h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Good morning, {context.user.name.split(" ")[0]}</h1><p className="mt-2 text-sm text-muted-foreground">Here’s what’s happening across your customer conversations.</p></div><div className="flex items-center gap-2"><Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />{overview.connectedAccounts} connected account{overview.connectedAccounts === 1 ? "" : "s"}</Badge><ButtonLink href="/dashboard/analytics" variant="outline" size="sm">View analytics <ArrowUpRight className="h-3.5 w-3.5" /></ButtonLink></div></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, detail, icon: Icon, href }) => <Link key={label} href={href} className="group"><Card className="h-full transition group-hover:border-primary/40 group-hover:shadow-md"><CardHeader className="flex-row items-start justify-between space-y-0 pb-3"><div><CardDescription>{label}</CardDescription><CardTitle className="mt-2 text-3xl">{value.toLocaleString()}</CardTitle></div><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span></CardHeader><CardContent><p className="text-xs text-muted-foreground">{detail}</p></CardContent></Card></Link>)}</div><div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]"><Card><CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Recent conversations</CardTitle><CardDescription className="mt-1">The latest activity across your connected numbers.</CardDescription></div><ButtonLink href="/dashboard/inbox" variant="ghost" size="sm">Open inbox <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></ButtonLink></CardHeader><CardContent>{overview.recentConversations.length === 0 ? <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed text-center"><UsersRound className="mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">No conversations yet</p><p className="mt-1 max-w-xs text-sm text-muted-foreground">Connect a WhatsApp account and incoming messages will appear here.</p></div> : <div className="divide-y">{overview.recentConversations.map((conversation) => <Link key={conversation.id} href={`/dashboard/inbox?conversationId=${conversation.id}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{conversation.contactName.slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{conversation.contactName}</p><p className="truncate text-xs text-muted-foreground">{conversation.phoneNumber} · {conversation.lastMessagePreview ?? "No preview"}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">{formatRelative(conversation.lastMessageAt)}</p>{conversation.unreadCount > 0 ? <span className="mt-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{conversation.unreadCount}</span> : null}</div></Link>)}</div>}</CardContent></Card><Card><CardHeader><CardTitle>Delivery health</CardTitle><CardDescription>Message status across this workspace.</CardDescription></CardHeader><CardContent><div className="space-y-5">{statusRows.map(({ key, label, color }) => { const value = overview.messages[key]; return <div key={key}><div className="mb-2 flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", color)} style={{ width: `${overview.messages.total === 0 ? 0 : Math.max(4, (value / overview.messages.total) * 100)}%` }} /></div></div>; })}</div><ButtonLink href="/dashboard/analytics" variant="outline" className="mt-7 w-full"><BarChart3 className="mr-2 h-4 w-4" />Explore analytics</ButtonLink></CardContent></Card></div></div>;
}
