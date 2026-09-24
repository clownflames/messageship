import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forms/auth-forms";

export const metadata: Metadata = { title: "Reset password | MessageShip" };

export default function ForgotPasswordPage() {
  return <div className="space-y-8"><div className="space-y-2"><p className="text-sm font-medium text-primary">Account recovery</p><h1 className="font-heading text-3xl font-semibold tracking-tight">Reset your password</h1><p className="text-sm text-muted-foreground">Enter your work email and we’ll send a secure reset link.</p></div><ForgotPasswordForm /><Link href="/login" className="block text-center text-sm font-medium text-primary hover:underline">Back to sign in</Link></div>;
}
