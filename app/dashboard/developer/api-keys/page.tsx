import type { Metadata } from "next";
import { KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/tenant";
import { revokeApiKeyAction } from "@/app/actions/api-keys";
import { listApiKeys } from "@/services/api/keys";
import { ApiKeyCreateForm } from "@/components/forms/api-key-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "API keys | MessageShip" };

export default async function ApiKeysPage() {
  const context = await requireWorkspace();
  let keys: Awaited<ReturnType<typeof listApiKeys>> = [];
  try { keys = await listApiKeys(context.organization.id); } catch { keys = []; }
  return <div className="space-y-8"><div><p className="text-sm font-medium text-primary">Developer access</p><h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">API keys</h1><p className="mt-2 text-sm text-muted-foreground">Create scoped credentials for external services. Raw keys are shown once and stored only as hashes.</p></div><div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]"><Card><CardHeader><CardTitle>Create API key</CardTitle><CardDescription>Choose the minimum scopes your integration needs.</CardDescription></CardHeader><CardContent><ApiKeyCreateForm /></CardContent></Card><Card><CardHeader><CardTitle>Active keys</CardTitle><CardDescription>Revocation takes effect immediately.</CardDescription></CardHeader><CardContent>{keys.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed text-center"><KeyRound className="mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">No API keys</p><p className="mt-1 text-sm text-muted-foreground">Create a scoped key to use the MessageShip API.</p></div> : <div className="space-y-3">{keys.map((key) => <div key={key.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-medium">{key.prefix}••••••••</p><p className="mt-1 text-sm font-medium">{key.name}</p></div><Badge className={key.revokedAt ? "border-destructive/20 bg-destructive/10 text-destructive" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}>{key.revokedAt ? "Revoked" : "Active"}</Badge></div><div className="mt-3 flex flex-wrap gap-1">{key.scopes.map((scope) => <Badge key={scope} variant="secondary">{scope}</Badge>)}</div><div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{key.lastUsedAt ? `Last used ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(key.lastUsedAt)}` : "Never used"}</span>{!key.revokedAt ? <form action={revokeApiKeyAction}><input type="hidden" name="keyId" value={key.id} /><Button type="submit" variant="ghost" size="sm" className="text-destructive"><Trash2 className="mr-1.5 h-3.5 w-3.5" />Revoke</Button></form> : null}</div></div>)}</div>}</CardContent></Card></div><div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />MessageShip validates the Bearer token and required scope on every API request. Tenant IDs are always taken from the key, never from request JSON.</div></div>;
}
