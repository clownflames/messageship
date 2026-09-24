import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "@/components/forms/auth-forms";

export const metadata: Metadata = { title: "Create account | MessageShip" };

export default function SignupPage() {
  return <div className="space-y-8"><div className="space-y-2"><p className="text-sm font-medium text-primary">Start building better conversations</p><h1 className="font-heading text-3xl font-semibold tracking-tight">Create your workspace</h1><p className="text-sm text-muted-foreground">One secure home for every WhatsApp account and team workflow.</p></div><SignupForm /><p className="text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link></p></div>;
}
