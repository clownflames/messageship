import type { Metadata } from "next";
import { getAppUrl } from "@/lib/config";
import { ApiDocs } from "@/components/docs/api-docs";

export const metadata: Metadata = { title: "API documentation | MessageShip" };

export default function PublicDocsPage() {
  return <main className="min-h-screen bg-muted/25"><div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8"><div className="mb-8 flex items-center gap-2 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">M</span>MessageShip API</div><ApiDocs apiBaseUrl={`${getAppUrl()}/api/v1`} /></div></main>;
}
