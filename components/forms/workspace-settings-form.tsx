"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { updateWorkspaceAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WorkspaceSettingsForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(updateWorkspaceAction, {});
  return <form action={action} className="space-y-4"><div className="space-y-2"><Label htmlFor="workspace-settings-name">Workspace name</Label><Input id="workspace-settings-name" name="name" defaultValue={name} required /></div>{state.error ? <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}{state.success ? <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{state.success}</p> : null}<Button type="submit" disabled={pending}>{pending ? <Loader2 className="mr-2 animate-spin" /> : null}{pending ? "Saving…" : "Save changes"}</Button></form>;
}
