"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { createWorkspaceAction, type WorkspaceActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WorkspaceForm() {
  const [state, action, pending] = useActionState<WorkspaceActionState, FormData>(createWorkspaceAction, {});
  return <form action={action} className="space-y-5"><div className="space-y-2"><Label htmlFor="name">Workspace name</Label><Input id="name" name="name" placeholder="Acme Customer Experience" required /></div>{state.error ? <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}<Button type="submit" className="h-10 w-full" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null}{pending ? "Creating workspace…" : "Create workspace"}</Button></form>;
}
