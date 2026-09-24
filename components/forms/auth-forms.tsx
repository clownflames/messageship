"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, passwordSchema, signupSchema, type LoginInput, type SignupInput } from "@/lib/validation/schemas";

const resetPasswordSchema = z.object({ password: passwordSchema });

function FormMessage({ children }: { children: string }) {
  return <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{children}</p>;
}

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  async function onSubmit(values: LoginInput) {
    setServerError(null);
    const result = await authClient.signIn.email({ email: values.email, password: values.password });
    if (result.error) {
      setServerError(result.error.message ?? "Unable to sign in");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }
  return <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
    <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" placeholder="you@company.com" {...register("email")} />{errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}</div>
    <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="password">Password</Label><Link href="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link></div><Input id="password" type="password" autoComplete="current-password" {...register("password")} />{errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}</div>
    {serverError ? <FormMessage>{serverError}</FormMessage> : null}
    <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" /> : null}{isSubmitting ? "Signing in…" : "Sign in"}</Button>
  </form>;
}

export function SignupForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "" },
  });
  async function onSubmit(values: SignupInput) {
    setServerError(null);
    const result = await authClient.signUp.email({ name: values.name, email: values.email, password: values.password });
    if (result.error) {
      setServerError(result.error.message ?? "Unable to create your account");
      return;
    }
    router.push("/dashboard/onboarding");
    router.refresh();
  }
  return <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
    <div className="space-y-2"><Label htmlFor="name">Full name</Label><Input id="name" autoComplete="name" placeholder="Alex Morgan" {...register("name")} />{errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}</div>
    <div className="space-y-2"><Label htmlFor="email">Work email</Label><Input id="email" type="email" autoComplete="email" placeholder="you@company.com" {...register("email")} />{errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}</div>
    <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="new-password" {...register("password")} />{errors.password ? <p className="text-xs text-destructive">Use at least 8 characters with a letter and number.</p> : null}</div>
    {serverError ? <FormMessage>{serverError}</FormMessage> : null}
    <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" /> : null}{isSubmitting ? "Creating account…" : "Create account"}</Button>
  </form>;
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Pick<LoginInput, "email">>({
    resolver: zodResolver(loginSchema.pick({ email: true })),
    defaultValues: { email: "" },
  });
  async function onSubmit(values: Pick<LoginInput, "email">) {
    setServerError(null);
    const result = await authClient.requestPasswordReset({ email: values.email, redirectTo: "/reset-password" });
    if (result.error) {
      setServerError(result.error.message ?? "Unable to send reset email");
      return;
    }
    setSent(true);
  }
  if (sent) {
    return <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">If an account exists for that email, a reset link is on its way.</div>;
  }
  return <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
    <div className="space-y-2"><Label htmlFor="email">Work email</Label><Input id="email" type="email" autoComplete="email" placeholder="you@company.com" {...register("email")} />{errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}</div>
    {serverError ? <FormMessage>{serverError}</FormMessage> : null}
    <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" /> : null}{isSubmitting ? "Sending…" : "Send reset link"}</Button>
  </form>;
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ password: string }>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "" },
  });
  async function onSubmit(values: { password: string }) {
    setServerError(null);
    const result = await authClient.resetPassword({ newPassword: values.password, token });
    if (result.error) {
      setServerError(result.error.message ?? "Unable to reset password");
      return;
    }
    setComplete(true);
  }
  if (complete) {
    return <div className="space-y-4"><p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">Your password has been updated.</p><Button type="button" className="h-10 w-full" onClick={() => { router.push("/login"); router.refresh(); }}>Return to sign in</Button></div>;
  }
  return <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
    <div className="space-y-2"><Label htmlFor="password">New password</Label><Input id="password" type="password" autoComplete="new-password" {...register("password")} />{errors.password ? <p className="text-xs text-destructive">Use at least 8 characters with a letter and number.</p> : null}</div>
    {serverError ? <FormMessage>{serverError}</FormMessage> : null}
    <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" /> : null}{isSubmitting ? "Updating…" : "Update password"}</Button>
  </form>;
}
