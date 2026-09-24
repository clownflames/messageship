"use client";

import { useActionState } from "react";
import { Copy, Loader2, Plus } from "lucide-react";
import { createWebhookAction, type WebhookActionState } from "@/app/actions/webhooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const events = ["message.received", "message.sent", "message.delivered", "message.read", "message.failed", "conversation.created", "conversation.updated", "contact.created", "campaign.completed"];

export function WebhookCreateForm() {
  const [state, action, pending] = useActionState<WebhookActionState, FormData>(createWebhookAction, {});
  return <form action={action} className="space-y-5"><div className="space-y-2"><Label htmlFor="webhook-name">Name</Label><Input id="webhook-name" name="name" placeholder="Production events" required /></div><div className="space-y-2"><Label htmlFor="webhook-url">HTTPS endpoint</Label><Input id="webhook-url" name="url" type="url" placeholder="https://example.com/hooks/messageship" required /></div><fieldset><legend className="text-sm font-medium">Events</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{events.map((event) => <label key={event} className="flex items-center gap-2 rounded-lg border p-2.5 text-xs hover:bg-muted"><input type="checkbox" name="events" value={event} defaultChecked={event === "message.received"} className="h-4 w-4 accent-primary" />{event}</label>)}</div></fieldset>{state.error ? <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}{state.secret ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4"><p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Copy this signing secret now. It will not be shown again.</p><div className="mt-3 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-background px-3 py-2 text-xs">{state.secret}</code><Button type="button" variant="outline" size="icon" onClick={() => void navigator.clipboard.writeText(state.secret ?? "")} aria-label="Copy signing secret"><Copy /></Button></div></div> : null}{!state.secret && state.success ? <p className="text-sm text-muted-foreground">{state.success}</p> : null}<Button type="submit" disabled={pending}>{pending ? <Loader2 className="mr-2 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}{pending ? "Creating…" : "Create webhook"}</Button></form>;
}
