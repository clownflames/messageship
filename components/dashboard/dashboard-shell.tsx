"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, Bot, Braces, ChevronDown, ContactRound, FileCode2, Gauge, Inbox, KeyRound, LayoutDashboard, Menu, MessageSquareText, PanelLeftClose, PanelLeftOpen, PlugZap, Send, Settings, Sparkles, Webhook, X } from "lucide-react";
import { switchWorkspaceAction, logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

const primaryNavigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
  { href: "/dashboard/contacts", label: "Contacts", icon: ContactRound },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Send },
  { href: "/dashboard/templates", label: "Templates", icon: FileCode2 },
  { href: "/dashboard/automations", label: "Automations", icon: WorkflowIcon },
  { href: "/dashboard/ai", label: "AI providers", icon: Sparkles },
  { href: "/dashboard/whatsapp", label: "WhatsApp accounts", icon: PlugZap },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
];

const developerNavigation = [
  { href: "/dashboard/developer/api-keys", label: "API keys", icon: KeyRound },
  { href: "/dashboard/developer/docs", label: "API docs", icon: Braces },
  { href: "/dashboard/developer/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/dashboard/developer/sdk", label: "SDK", icon: FileCode2 },
];

function WorkflowIcon(props: React.ComponentProps<typeof Gauge>) {
  return <Bot {...props} />;
}

type WorkspaceOption = { id: string; name: string; role: string };

type DashboardShellProps = {
  user: { name: string; email: string };
  activeWorkspace: { id: string; name: string };
  workspaces: WorkspaceOption[];
  children: React.ReactNode;
};

export function DashboardShell({ user, activeWorkspace, workspaces, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  function isActive(href: string) {
    return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
  }

  const navigation = <nav className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
    <div className="space-y-1"><p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workspace</p>{primaryNavigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground", isActive(href) && "bg-primary/10 font-medium text-primary")}><Icon className="h-4 w-4 shrink-0" /><span className={cn(collapsed && "lg:hidden")}>{label}</span></Link>)}</div>
    <div className="space-y-1"><p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Developer</p>{developerNavigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground", isActive(href) && "bg-primary/10 font-medium text-primary")}><Icon className="h-4 w-4 shrink-0" /><span className={cn(collapsed && "lg:hidden")}>{label}</span></Link>)}</div>
    <div className="mt-auto space-y-1"><Link href="/dashboard/settings" onClick={() => setMobileOpen(false)} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground", isActive("/dashboard/settings") && "bg-primary/10 font-medium text-primary")}><Settings className="h-4 w-4" /><span className={cn(collapsed && "lg:hidden")}>Settings</span></Link><div className={cn("mt-3 rounded-xl border bg-muted/40 p-3", collapsed && "lg:hidden")}><p className="text-xs font-medium">Need a hand?</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Connect a number to start receiving conversations.</p><Link href="/dashboard/whatsapp" className="mt-2 inline-flex text-xs font-medium text-primary hover:underline">Connect WhatsApp <span aria-hidden>→</span></Link></div></div>
  </nav>;

  return <div className="min-h-screen bg-muted/25"><aside className={cn("fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-background transition-[width] lg:flex", collapsed && "w-[76px]")}><div className={cn("flex h-16 items-center border-b px-5", collapsed && "justify-center px-2")}><Link href="/dashboard" className="flex items-center gap-2 font-semibold"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><MessageSquareText className="h-4 w-4" /></span><span className={cn(collapsed && "lg:hidden")}>MessageShip</span></Link><Button type="button" variant="ghost" size="icon" className="ml-auto hidden lg:inline-flex" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button></div>{navigation}</aside>
    {mobileOpen ? <div className="fixed inset-0 z-50 lg:hidden"><button type="button" aria-label="Close navigation" className="absolute inset-0 bg-slate-950/40" onClick={() => setMobileOpen(false)} /><aside className="relative flex h-full w-72 flex-col border-r bg-background shadow-xl"><div className="flex h-16 items-center justify-between border-b px-5"><Link href="/dashboard" className="flex items-center gap-2 font-semibold" onClick={() => setMobileOpen(false)}><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"><MessageSquareText className="h-4 w-4" /></span>MessageShip</Link><Button type="button" variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X /></Button></div>{navigation}</aside></div> : null}
    <div className={cn("min-h-screen transition-[padding] lg:pl-64", collapsed && "lg:pl-[76px]")}><header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur sm:px-6"><Button type="button" variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu /></Button><form className="hidden min-w-0 flex-1 md:block" action={switchWorkspaceAction}><label htmlFor="workspace-switcher" className="sr-only">Workspace</label><select id="workspace-switcher" name="organizationId" defaultValue={activeWorkspace.id} onChange={(event) => event.currentTarget.form?.requestSubmit()} className="max-w-56 rounded-lg border bg-background px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20"><option value={activeWorkspace.id}>{activeWorkspace.name}</option>{workspaces.filter((workspace) => workspace.id !== activeWorkspace.id).map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></form><div className="ml-auto flex items-center gap-1"><div className="hidden items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" />All systems operational</div><ThemeToggle /><details className="relative"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted"><span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{user.name.slice(0, 1).toUpperCase()}</span><ChevronDown className="h-4 w-4 text-muted-foreground" /></summary><div className="absolute right-0 mt-2 w-56 rounded-xl border bg-background p-2 shadow-lg"><p className="truncate px-3 py-2 text-sm font-medium">{user.name}</p><p className="truncate px-3 pb-2 text-xs text-muted-foreground">{user.email}</p><form action={logoutAction}><button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10">Sign out</button></form></div></details></div></header><main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">{children}</main></div>
  </div>;
}
