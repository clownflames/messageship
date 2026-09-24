import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "secondary" | "destructive" };

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", variant === "secondary" && "border-transparent bg-muted text-muted-foreground", variant === "destructive" && "border-destructive/20 bg-destructive/10 text-destructive", className)} {...props} />;
}
