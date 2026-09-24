"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ShieldCheck } from "lucide-react";
import { connectWhatsappAccountAction, type WhatsappAccountActionState } from "@/app/actions/whatsapp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { whatsappAccountConnectionSchema, type WhatsappAccountConnectionInput } from "@/lib/validation/schemas";

export function WhatsappConnectionForm() {
  const [state, setState] = useState<WhatsappAccountActionState>({});
  const [showToken, setShowToken] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<WhatsappAccountConnectionInput>({ resolver: zodResolver(whatsappAccountConnectionSchema), defaultValues: { name: "", businessName: "", businessId: "", wabaId: "", phoneNumberId: "", accessToken: "" } });
  async function onSubmit(values: WhatsappAccountConnectionInput) {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => formData.append(key, value));
    const result = await connectWhatsappAccountAction({}, formData);
    setState(result);
    if (result.success) reset();
  }
  return <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="account-name">Account name</Label><Input id="account-name" placeholder="Customer support" {...register("name")} />{errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}</div><div className="space-y-2"><Label htmlFor="business-name">Business name <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="business-name" placeholder="Acme Inc." {...register("businessName")} /></div><div className="space-y-2"><Label htmlFor="business-id">Business ID</Label><Input id="business-id" placeholder="Meta business ID" {...register("businessId")} />{errors.businessId ? <p className="text-xs text-destructive">{errors.businessId.message}</p> : null}</div><div className="space-y-2"><Label htmlFor="waba-id">WhatsApp Business Account ID</Label><Input id="waba-id" placeholder="WABA ID" {...register("wabaId")} />{errors.wabaId ? <p className="text-xs text-destructive">{errors.wabaId.message}</p> : null}</div><div className="space-y-2"><Label htmlFor="phone-number-id">Phone number ID</Label><Input id="phone-number-id" placeholder="Phone number ID" {...register("phoneNumberId")} />{errors.phoneNumberId ? <p className="text-xs text-destructive">{errors.phoneNumberId.message}</p> : null}</div><div className="space-y-2 sm:col-span-2"><Label htmlFor="access-token">Permanent access token</Label><div className="flex gap-2"><Input id="access-token" type={showToken ? "text" : "password"} autoComplete="off" placeholder="EA..." {...register("accessToken")} /><Button type="button" variant="outline" onClick={() => setShowToken((value) => !value)}>{showToken ? "Hide" : "Show"}</Button></div>{errors.accessToken ? <p className="text-xs text-destructive">{errors.accessToken.message}</p> : null}<p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Encrypted before storage and never returned to the browser.</p></div></div>
    {state.error ? <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}{state.success ? <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{state.success}</p> : null}<Button type="submit" className="h-10 w-full" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" /> : null}{isSubmitting ? "Verifying connection…" : "Connect WhatsApp account"}</Button>
  </form>;
}
