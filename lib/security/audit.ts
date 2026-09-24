import { headers } from "next/headers";
import { db } from "@/db";
import { auditLogs, type JsonValue } from "@/db/schema";
import { generateId } from "@/lib/security/crypto";

export async function getRequestContext(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const requestHeaders = await headers();
  return {
    ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? requestHeaders.get("x-real-ip"),
    userAgent: requestHeaders.get("user-agent"),
  };
}

export async function recordAudit(input: {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: JsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const requestContext = await getRequestContext();
  await db.insert(auditLogs).values({
    id: generateId(),
    organizationId: input.organizationId ?? null,
    userId: input.userId ?? null,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata ?? {},
    ipAddress: input.ipAddress ?? requestContext.ipAddress,
    userAgent: input.userAgent ?? requestContext.userAgent,
  });
}
