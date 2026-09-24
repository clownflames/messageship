import type { Metadata } from "next";
import { FileCode2, RefreshCw } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/tenant";
import { listWhatsappAccounts } from "@/services/whatsapp/accounts";
import { listTemplates } from "@/services/templates/templates";
import { TemplateActions, TemplateCreateForm } from "@/components/templates/template-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Templates | MessageShip" };

function statusClass(status: string): string {
  if (status === "approved") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "rejected") return "border-destructive/20 bg-destructive/10 text-destructive";
  return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

export default async function TemplatesPage() {
  const context = await requireWorkspace();
  let accounts: Awaited<ReturnType<typeof listWhatsappAccounts>> = [];
  let templateRows: Awaited<ReturnType<typeof listTemplates>> = [];
  try { [accounts, templateRows] = await Promise.all([listWhatsappAccounts(context.organization.id), listTemplates(context.organization.id)]); } catch { accounts = []; templateRows = []; }
  return <div className="space-y-8"><div><p className="text-sm font-medium text-primary">Messaging library</p><h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Templates</h1><p className="mt-2 text-sm text-muted-foreground">Create, submit, and monitor approved WhatsApp templates through Meta.</p></div><div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]"><Card><CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Your templates</CardTitle><CardDescription className="mt-1">Approval status always comes from Meta.</CardDescription></div><Badge variant="secondary">{templateRows.length} total</Badge></CardHeader><CardContent>{templateRows.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed text-center"><FileCode2 className="mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">No templates yet</p><p className="mt-1 text-sm text-muted-foreground">Create your first template to use it in campaigns and conversations.</p></div> : <div className="space-y-3">{templateRows.map((template) => <div key={template.id} className="rounded-xl border p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2"><p className="font-medium">{template.name}</p><Badge className={statusClass(template.status)}>{template.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{template.language} · {template.category} · updated {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(template.updatedAt)}</p></div><TemplateActions templateId={template.id} accountId={template.whatsappAccountId} /></div><div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm leading-6">{template.components.filter((component) => component.type === "BODY").map((component) => <p key={component.id}>{component.content}</p>)}</div>{template.rejectionReason ? <p className="mt-2 text-xs text-destructive">Meta feedback: {template.rejectionReason}</p> : null}</div>)}</div>}</CardContent></Card><Card><CardHeader><CardTitle>Create template</CardTitle><CardDescription>Submit a structured template to the selected WhatsApp Business Account.</CardDescription></CardHeader><CardContent><TemplateCreateForm accounts={accounts.map((account) => ({ id: account.id, name: account.name }))} /></CardContent></Card></div><div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 text-primary" />Use “Refresh status” after Meta reviews a submission. MessageShip never fabricates approval state.</div></div>;
}
