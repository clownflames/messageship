"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("MessageShip render error"); }, []);
  return <main className="grid min-h-screen place-items-center bg-muted/25 p-6"><div className="max-w-md text-center"><p className="text-sm font-medium text-destructive">Something went wrong</p><h1 className="mt-2 font-heading text-3xl font-semibold">We couldn’t load this view.</h1><p className="mt-3 text-sm text-muted-foreground">Try again. If the problem continues, check the workspace connection and service logs.</p><Button className="mt-6" onClick={() => reset()}>Try again</Button></div></main>;
}
