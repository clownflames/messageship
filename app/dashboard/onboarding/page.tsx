import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";
import { getSession, listWorkspaces } from "@/lib/auth/tenant";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceForm } from "@/components/forms/workspace-form";

export const metadata: Metadata = { title: "Set up your workspace | MessageShip" };
export const dynamic = "force-dynamic";

const features = [
  { icon: ShieldCheck, title: "Tenant-isolated by design", description: "Your workspace data is only accessible to authorized members." },
  { icon: MessageSquareText, title: "One inbox for every number", description: "Keep conversations, contacts, and delivery states in one place." },
  { icon: Sparkles, title: "Automate with context", description: "Connect AI and workflows without giving up control." },
];

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  const workspaces = await listWorkspaces(session.user.id);
  return <div className="min-h-screen bg-muted/25 px-4 py-10 sm:px-8"><div className="mx-auto max-w-5xl"><div className="mb-10 flex items-center gap-2 font-semibold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground"><MessageSquareText className="h-5 w-5" /></span>MessageShip</div><div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-start"><div><p className="text-sm font-medium text-primary">Welcome to MessageShip</p><h1 className="mt-3 max-w-xl font-heading text-4xl font-semibold tracking-tight sm:text-5xl">Your customer communication workspace starts here.</h1><p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">Connect your business numbers, keep every conversation organized, and give your team a reliable way to move customers forward.</p><div className="mt-8 space-y-4">{features.map(({ icon: Icon, title, description }) => <div key={title} className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span><div><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div>)}</div></div><Card><CardHeader><CardTitle>{workspaces.length > 0 ? "Your workspace is ready" : "Create your workspace"}</CardTitle><CardDescription>{workspaces.length > 0 ? "Continue to connect your first WhatsApp Cloud API account." : "Choose a name your team will recognize."}</CardDescription></CardHeader><CardContent className="space-y-5">{workspaces.length > 0 ? <><div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-5 w-5" /><span>{workspaces[0].organization.name} is active.</span></div><ButtonLink href="/dashboard/whatsapp" className="h-10 w-full">Connect WhatsApp <ArrowRight className="h-4 w-4" /></ButtonLink><ButtonLink href="/dashboard" variant="outline" className="h-10 w-full">Skip to dashboard</ButtonLink></> : <WorkspaceForm />}</CardContent></Card></div></div></div>;
}
