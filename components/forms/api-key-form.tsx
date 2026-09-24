"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Loader2, Plus } from "lucide-react";
import { createApiKeyAction, type ApiKeyActionState } from "@/app/actions/api-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const scopes = ["messages:read", "messages:write", "contacts:read", "contacts:write", "templates:read", "templates:write", "campaigns:read", "campaigns:write", "webhooks:read", "webhooks:write"];

export function ApiKeyCreateForm() {
  const [state, action, pending] = useActionState<ApiKeyActionState, FormData>(createApiKeyAction, {});
  const [expiresAt, setExpiresAt] = useState("");
  const [copied, setCopied] = useState(false);
  return <form action={action} className="space-y-5"><div className="space-y-2"><Label htmlFor="api-key-name">Key name</Label><Input id="api-key-name" name="name" placeholder="Production server" required /></div><div className="space-y-2"><Label htmlFor="api-key-expiry">Expiration <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="api-key-expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /><input type="hidden" name="expiresAt" value={expiresAt ? new Date(expiresAt).toISOString() : ""} /></div><fieldset><legend className="text-sm font-medium">Scopes</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{scopes.map((scope) => <label key={scope} className="flex items-center gap-2 rounded-lg border p-2.5 text-xs hover:bg-muted"><input type="checkbox" name="scopes" value={scope} defaultChecked={scope === "messages:read" || scope === "messages:write"} className="h-4 w-4 accent-primary" />{scope}</label>)}</div></fieldset>{state.error ? <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}{state.rawKey ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4"><p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Copy this key now. It will not be shown again.</p><div className="mt-3 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-background px-3 py-2 text-xs">{state.rawKey}</code><Button type="button" variant="outline" size="icon" onClick={() => { void navigator.clipboard.writeText(state.rawKey ?? ""); setCopied(true); }} aria-label="Copy API key">{copied ? <Check /> : <Copy />}</Button></div></div> : null}{!state.rawKey && state.success ? <p className="text-sm text-muted-foreground">{state.success}</p> : null}<Button type="submit" disabled={pending}>{pending ? <Loader2 className="mr-2 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}{pending ? "Creating…" : "Create API key"}</Button></form>;
}
