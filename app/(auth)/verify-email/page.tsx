import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Verify email | MessageShip" };

export default function VerifyEmailPage() {
  return <div className="space-y-8"><div className="space-y-2"><p className="text-sm font-medium text-primary">Almost verified</p><h1 className="font-heading text-3xl font-semibold tracking-tight">Check your inbox</h1><p className="text-sm text-muted-foreground">Your verification link has been sent. Open it on this device to secure your account.</p></div><Link href="/login" className="flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/80">Return to sign in</Link></div>;
}
