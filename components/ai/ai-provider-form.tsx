"use client";

import { useActionState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { createAIProviderAction, type AiActionState } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AIProviderForm() {
  const [state, action, pending] = useActionState<AiActionState, FormData>(createAIProviderAction, {});
  return <form action={action} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="ai-name">Provider name</Label><Input id="ai-name" name="name" placeholder="OpenAI production" required /></div><div className="space-y-2"><Label htmlFor="ai-kind">Provider</Label><select id="ai-kind" name="kind" className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none"><option value="openai">OpenAI</option><option value="deepseek">DeepSeek</option><option value="anthropic">Anthropic</option><option value="gemini">Google Gemini</option><option value="openrouter">OpenRouter</option><option value="ollama">Ollama</option><option value="openai_compatible">OpenAI-compatible</option></select></div><div className="space-y-2"><Label htmlFor="ai-model">Model</Label><Input id="ai-model" name="model" placeholder="gpt-4.1-mini" required /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="ai-key">API key</Label><Input id="ai-key" name="apiKey" type="password" autoComplete="off" placeholder="Encrypted before storage" /><p className="text-xs text-muted-foreground">Ollama and local OpenAI-compatible endpoints can leave this blank.</p></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="ai-base-url">Base URL <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="ai-base-url" name="baseUrl" type="url" placeholder="https://api.example.com/v1" /></div></div>{state.error ? <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}{state.success ? <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{state.success}</p> : null}<Button type="submit" disabled={pending}>{pending ? <Loader2 className="mr-2 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{pending ? "Saving…" : "Save provider"}</Button></form>;
}
