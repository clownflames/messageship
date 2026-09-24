import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/forms/auth-forms";

export const metadata: Metadata = { title: "Choose a new password | MessageShip" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return <div className="space-y-8"><div className="space-y-2"><p className="text-sm font-medium text-primary">Almost there</p><h1 className="font-heading text-3xl font-semibold tracking-tight">Choose a new password</h1><p className="text-sm text-muted-foreground">Use a unique password you don’t use elsewhere.</p></div>{params.token ? <ResetPasswordForm token={params.token} /> : <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">This reset link is missing its token. Request a new link to continue.</div>}<Link href="/login" className="block text-center text-sm font-medium text-primary hover:underline">Back to sign in</Link></div>;
}
