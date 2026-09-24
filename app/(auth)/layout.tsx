import Link from "next/link";
import { MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]">
    <section className="relative hidden overflow-hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative"><Link href="/" className="inline-flex items-center gap-2 text-lg font-semibold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400 text-slate-950"><MessageSquareText className="h-5 w-5" /></span>MessageShip</Link></div>
      <div className="relative max-w-xl space-y-6"><p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">The operating system for customer conversations</p><h1 className="font-heading text-5xl font-semibold leading-tight tracking-tight">Every WhatsApp conversation, finally in focus.</h1><p className="max-w-lg text-lg leading-8 text-slate-300">Connect every business number, manage customer relationships, and turn conversations into measurable growth from one secure workspace.</p><div className="grid gap-3 pt-4 text-sm text-slate-300 sm:grid-cols-3"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Tenant isolated</span><span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-300" /> Built for scale</span><span className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-emerald-300" /> API first</span></div></div>
      <p className="relative text-xs text-slate-500">© 2026 MessageShip. Built for thoughtful teams.</p>
    </section>
    <section className="flex min-h-screen items-center justify-center p-6 sm:p-10"><div className="w-full max-w-md">{children}</div></section>
  </main>;
}
