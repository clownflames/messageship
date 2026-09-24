import type { Metadata } from "next";
import { getAppUrl } from "@/lib/config";
import { ApiDocs } from "@/components/docs/api-docs";

export const metadata: Metadata = { title: "API docs | MessageShip" };

export default function DeveloperDocsPage() {
  return <ApiDocs apiBaseUrl={`${getAppUrl()}/api/v1`} />;
}
