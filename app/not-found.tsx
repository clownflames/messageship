import { ButtonLink } from "@/components/ui/button-link";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-muted/25 p-6"><div className="text-center"><p className="text-sm font-medium text-primary">404</p><h1 className="mt-2 font-heading text-3xl font-semibold">That page is not here.</h1><p className="mt-3 text-sm text-muted-foreground">Return to your workspace and continue from a known view.</p><ButtonLink href="/dashboard" className="mt-6">Back to dashboard</ButtonLink></div></main>;
}
