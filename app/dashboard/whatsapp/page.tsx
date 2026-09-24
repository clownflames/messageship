import type { Metadata } from "next";
import { CheckCircle2, CircleAlert, MessageSquareText, Phone, PlugZap, RefreshCw, Unplug } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/tenant";
import { disconnectWhatsappAccountAction, refreshWhatsappAccountAction } from "@/app/actions/whatsapp";
import { WhatsappConnectionForm } from "@/components/forms/whatsapp-connection-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWhatsappAccountMessageCounts, listWhatsappAccounts } from "@/services/whatsapp/accounts";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "WhatsApp accounts | MessageShip" };

function statusClass(status: string): string {
  if (status === "connected") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "error") return "border-destructive/20 bg-destructive/10 text-destructive";
  return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

export default async function WhatsappAccountsPage() {
  const context = await requireWorkspace();
  let accounts: Awaited<ReturnType<typeof listWhatsappAccounts>> = [];
  let messageCounts: Record<string, number> = {};
  try {
    [accounts, messageCounts] = await Promise.all([listWhatsappAccounts(context.organization.id), getWhatsappAccountMessageCounts(context.organization.id)]);
  } catch {
    accounts = [];
  }
  return <div className="space-y-8"><div><p className="text-sm font-medium text-primary">Connections</p><h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">WhatsApp accounts</h1><p className="mt-2 text-sm text-muted-foreground">Connect and manage every WhatsApp Cloud API number your workspace uses.</p></div><div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]"><Card><CardHeader><CardTitle>Connected accounts</CardTitle><CardDescription>Tokens are encrypted and never displayed after setup.</CardDescription></CardHeader><CardContent className="space-y-4">{accounts.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed text-center"><PlugZap className="mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">No accounts connected</p><p className="mt-1 max-w-xs text-sm text-muted-foreground">Connect your first number to start receiving messages and using the API.</p></div> : accounts.map((account) => <div key={account.id} className="rounded-xl border p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Phone className="h-5 w-5" /></span><div><p className="font-medium">{account.businessName ?? account.name}</p><p className="mt-1 text-sm text-muted-foreground">{account.name} · {account.phoneNumberId ?? "Phone number not available"}</p></div></div><Badge className={cn("w-fit", statusClass(account.status))}>{account.status === "connected" ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> : <CircleAlert className="mr-1.5 h-3.5 w-3.5" />}{account.status}</Badge></div><div className="mt-4 grid gap-3 border-t pt-4 text-xs text-muted-foreground sm:grid-cols-3"><span><strong className="block text-foreground">{messageCounts[account.id] ?? 0}</strong>messages</span><span><strong className="block text-foreground">{account.wabaId ?? "—"}</strong>WABA ID</span><span><strong className="block text-foreground">{account.lastWebhookAt ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(account.lastWebhookAt) : "No events yet"}</strong>last webhook</span></div><div className="mt-4 flex flex-wrap gap-2"><a href={`/dashboard/inbox?accountId=${account.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><MessageSquareText className="mr-1.5 h-3.5 w-3.5" />Open inbox</a><form action={refreshWhatsappAccountAction}><input type="hidden" name="accountId" value={account.id} /><Button type="submit" variant="ghost" size="sm"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button></form><form action={disconnectWhatsappAccountAction}><input type="hidden" name="accountId" value={account.id} /><Button type="submit" variant="ghost" size="sm" className="text-destructive"><Unplug className="mr-1.5 h-3.5 w-3.5" />Disconnect</Button></form></div></div>)}</CardContent></Card><Card><CardHeader><CardTitle>Connect an account</CardTitle><CardDescription>Use a permanent System User token with the required WhatsApp permissions.</CardDescription></CardHeader><CardContent><WhatsappConnectionForm /></CardContent></Card></div><div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground"><p className="font-medium text-foreground">Before you connect</p><p className="mt-1 leading-6">Create or select a Meta app, add the WhatsApp product, generate a permanent token, and configure the webhook URL as <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/api/webhooks/whatsapp</code>. MessageShip verifies the number before saving it.</p></div></div>;
}
