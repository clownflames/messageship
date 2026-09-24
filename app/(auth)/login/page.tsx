import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/forms/auth-forms";

export const metadata: Metadata = { title: "Sign in | MessageShip" };

export default function LoginPage() {
  return <div className="space-y-8"><div className="space-y-2"><p className="text-sm font-medium text-primary">Welcome back</p><h1 className="font-heading text-3xl font-semibold tracking-tight">Sign in to MessageShip</h1><p className="text-sm text-muted-foreground">Continue where your customer conversations left off.</p></div><LoginForm /><p className="text-center text-sm text-muted-foreground">New to MessageShip? <Link href="/signup" className="font-medium text-primary hover:underline">Create an account</Link></p></div>;
}
