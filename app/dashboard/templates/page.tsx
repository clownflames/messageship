import type { Metadata } from "next";
import { CircleAlert, FileCode2 } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/tenant";
import { listWhatsappAccounts } from "@/services/whatsapp/accounts";
import { listTemplates } from "@/services/templates/templates";
import { TemplateActions, TemplateCreateForm, TemplateSyncForm } from "@/components/templates/template-forms";
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
  const loadErrors: string[] = [];
  try {
    accounts = await listWhatsappAccounts(context.organization.id);
  } catch {
    loadErrors.push("Could not load WhatsApp accounts.");
  }
  try {
    templateRows = await listTemplates(context.organization.id);
  } catch {
    loadErrors.push("Could not load templates from the database.");
  }
  const connectedAccounts = accounts.filter((account) => account.status === "connected" && account.wabaId);
  return <div className="space-y-8"><div><p className="text-sm font-medium text-primary">Messaging library</p><h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Templates</h1><p className="mt-2 text-sm text-muted-foreground">Create, submit, and monitor approved WhatsApp templates through Meta.</p></div>{loadErrors.length > 0 ? <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{loadErrors.join(" ")}</div> : null}<div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]"><Card><CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Your templates</CardTitle><CardDescription className="mt-1">Approval status always comes from Meta.</CardDescription></div><Badge variant="secondary">{templateRows.length} total</Badge></CardHeader><CardContent>{templateRows.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed text-center"><FileCode2 className="mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">No templates yet</p><p className="mt-1 max-w-sm text-sm text-muted-foreground">Create a template or fetch the templates already available in your Meta WhatsApp Business Account.</p></div> : <div className="space-y-3">{templateRows.map((template) => <div key={template.id} className="rounded-xl border p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2"><p className="font-medium">{template.name}</p><Badge className={statusClass(template.status)}>{template.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{template.language} · {template.category} · updated {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(template.updatedAt)}</p></div><TemplateActions templateId={template.id} accountId={template.whatsappAccountId} /></div><div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm leading-6">{template.components.filter((component) => component.type === "BODY").map((component) => <p key={component.id}>{component.content}</p>)}</div>{template.rejectionReason ? <p className="mt-2 text-xs text-destructive">Meta rejected this template: {template.rejectionReason}</p> : null}</div>)}</div>}</CardContent></Card><div className="space-y-6"><Card><CardHeader><CardTitle>Fetch from Meta</CardTitle><CardDescription>Import templates and approval statuses from a connected account.</CardDescription></CardHeader><CardContent><TemplateSyncForm accounts={connectedAccounts} /></CardContent></Card><Card><CardHeader><CardTitle>Create template</CardTitle><CardDescription>Submit a new template for Meta approval.</CardDescription></CardHeader><CardContent><TemplateCreateForm accounts={connectedAccounts} /></CardContent></Card></div></div></div>;
}
