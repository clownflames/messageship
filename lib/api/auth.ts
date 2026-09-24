import { assertDatabaseConfigured, db } from "@/db";
import { usageRecords } from "@/db/schema";
import { generateId } from "@/lib/security/crypto";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { AppError } from "@/lib/errors";
import { authenticateApiKey, type ApiKeyContext, type ApiScope } from "@/services/api/keys";

function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token || null;
}

export async function requireApiContext(request: Request, scope: ApiScope): Promise<ApiKeyContext> {
  assertDatabaseConfigured();
  const token = bearerToken(request);
  if (!token) throw new AppError("UNAUTHORIZED", "A Bearer API key is required", 401);
  const context = await authenticateApiKey(token, scope);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit(`api:${context.apiKey.id}:${ip}`, 120, 60_000);
  if (!limit.allowed) throw new AppError("RATE_LIMITED", `Rate limit exceeded. Retry in ${limit.retryAfterSeconds} seconds.`, 429);
  await db.insert(usageRecords).values({ id: generateId(), organizationId: context.organizationId, type: "api_request", resourceType: "route", metadata: { method: request.method, path: new URL(request.url).pathname } });
  return context;
}
