"use client";

import { useActionState, useMemo, useState } from "react";
import { Bot, GitBranch, Loader2, MessageSquare, Plus, Send, Trash2, Zap } from "lucide-react";
import { createAutomationAction, type AutomationActionState } from "@/app/actions/automations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Account = { id: string; name: string };
type Provider = { id: string; name: string };
type NodeType = "incoming_message" | "ai" | "send_text" | "send_template" | "condition" | "end";
type NodeDraft = { id: string; type: NodeType; name: string; config: Record<string, unknown> };

const initialNodes: NodeDraft[] = [
  { id: "trigger", type: "incoming_message", name: "Incoming message", config: {} },
  { id: "ai", type: "ai", name: "Generate reply", config: { prompt: "{{message.body}}", model: "" } },
  { id: "send", type: "send_text", name: "Send reply", config: { text: "{{aiText}}" } },
];

function nodeIcon(type: NodeType) {
  if (type === "incoming_message") return <MessageSquare className="h-4 w-4" />;
  if (type === "ai") return <Bot className="h-4 w-4" />;
  if (type === "condition") return <GitBranch className="h-4 w-4" />;
  if (type === "end") return <Zap className="h-4 w-4" />;
  return <Send className="h-4 w-4" />;
}

export function AutomationBuilderForm({ accounts, providers }: { accounts: Account[]; providers: Provider[] }) {
  const [state, action, pending] = useActionState<AutomationActionState, FormData>(createAutomationAction, {});
  const [nodes, setNodes] = useState<NodeDraft[]>(initialNodes);
  const [name, setName] = useState("AI support reply");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [model, setModel] = useState("");
  const serializedNodes = useMemo(() => JSON.stringify(nodes.map((node, index) => ({ ...node, positionX: 80, positionY: 80 + index * 120, config: node.type === "ai" ? { ...node.config, providerId, model } : node.type === "send_text" ? { ...node.config, accountId, to: "{{to}}" } : node.config }))), [accountId, model, nodes, providerId]);
  const edges = useMemo(() => JSON.stringify(nodes.slice(0, -1).map((node, index) => ({ sourceNodeId: node.id, targetNodeId: nodes[index + 1].id }))), [nodes]);
  function updateAi(value: string) { setNodes((current) => current.map((node) => node.type === "ai" ? { ...node, config: { ...node.config, prompt: value } } : node)); }
  function addCondition() { setNodes((current) => [...current.slice(0, -1), { id: `condition-${Date.now()}`, type: "condition", name: "Condition", config: { expression: "{{message.body}} contains" } }, current[current.length - 1]]); }
  function removeNode(id: string) { setNodes((current) => current.filter((node) => node.id !== id)); }
  return <form action={action} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="automation-name">Automation name</Label><Input id="automation-name" name="name" value={name} onChange={(event) => setName(event.target.value)} required /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="automation-description">Description</Label><Input id="automation-description" name="description" placeholder="Reply to common questions with a helpful AI response" /></div><div className="space-y-2"><Label htmlFor="automation-account">WhatsApp account</Label><select id="automation-account" value={accountId} onChange={(event) => setAccountId(event.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none"><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select><input type="hidden" name="whatsappAccountId" value={accountId} /></div><div className="space-y-2"><Label htmlFor="automation-enabled">Status</Label><select id="automation-enabled" name="enabled" className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none"><option value="false">Draft</option><option value="true">Active</option></select></div></div><div className="rounded-2xl border bg-muted/30 p-4"><div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-medium">Workflow canvas</p><p className="text-xs text-muted-foreground">Nodes run from top to bottom. The engine remains independent from this UI.</p></div><Button type="button" variant="outline" size="sm" onClick={addCondition}><Plus className="mr-1.5 h-3.5 w-3.5" />Condition</Button></div><div className="space-y-2">{nodes.map((node, index) => <div key={node.id} className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-background text-primary">{nodeIcon(node.type)}</div><div className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-medium">{node.name}</p><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{node.type.replaceAll("_", " ")}</span></div>{node.type === "ai" ? <div className="mt-2 flex gap-2"><select value={providerId} onChange={(event) => setProviderId(event.target.value)} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"><option value="">Provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select><Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model" className="h-8 text-xs" /><Input value={typeof node.config.prompt === "string" ? node.config.prompt : ""} onChange={(event) => updateAi(event.target.value)} placeholder="Prompt" className="h-8 text-xs" /></div> : null}{node.type === "send_text" ? <p className="mt-1 truncate text-xs text-muted-foreground">Send generated reply to the incoming contact</p> : null}</div>{index < nodes.length - 1 ? <div className="h-4 w-px bg-border" /> : null}{node.type !== "incoming_message" ? <Button type="button" variant="ghost" size="icon" aria-label="Remove node" onClick={() => removeNode(node.id)} className="text-destructive"><Trash2 /></Button> : null}</div>)}</div></div><input type="hidden" name="nodes" value={serializedNodes} /><input type="hidden" name="edges" value={edges} />{state.error ? <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}{state.success ? <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"><p>{state.success}</p>{state.triggerSecret ? <p className="mt-2 break-all font-mono text-xs">Copy this webhook secret now: {state.triggerSecret}</p> : null}</div> : null}<Button type="submit" disabled={pending || accounts.length === 0}>{pending ? <Loader2 className="mr-2 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}{pending ? "Creating…" : "Create automation"}</Button></form>;
}
