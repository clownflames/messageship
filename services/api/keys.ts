import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, usageRecords, type ApiKey } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { generateApiKey, generateId, hashSecret } from "@/lib/security/crypto";
import { apiKeyCreateSchema, type ApiKeyCreateInput } from "@/lib/validation/schemas";

export const API_SCOPES = ["messages:read", "messages:write", "contacts:read", "contacts:write", "templates:read", "templates:write", "campaigns:read", "campaigns:write", "webhooks:read", "webhooks:write"] as const;
export type ApiScope = typeof API_SCOPES[number];

export type PublicApiKey = Omit<ApiKey, "keyHash">;

export type ApiKeyContext = {
  apiKey: PublicApiKey;
  organizationId: string;
  scopes: ApiScope[];
};

function toPublic(key: ApiKey): PublicApiKey {
  return { id: key.id, organizationId: key.organizationId, createdBy: key.createdBy, name: key.name, prefix: key.prefix, scopes: key.scopes, lastUsedAt: key.lastUsedAt, expiresAt: key.expiresAt, revokedAt: key.revokedAt, createdAt: key.createdAt };
}

export function hasScope(context: ApiKeyContext, scope: ApiScope): boolean {
  return context.scopes.includes(scope);
}

export function requireScope(context: ApiKeyContext, scope: ApiScope): void {
  if (!hasScope(context, scope)) throw new AppError("FORBIDDEN", `API key is missing the ${scope} scope`, 403);
}

export async function listApiKeys(organizationId: string): Promise<PublicApiKey[]> {
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.organizationId, organizationId)).orderBy(desc(apiKeys.createdAt));
  return rows.map(toPublic);
}

export async function createApiKey(organizationId: string, userId: string, input: ApiKeyCreateInput): Promise<{ apiKey: PublicApiKey; rawKey: string }> {
  const parsed = apiKeyCreateSchema.parse(input);
  const generated = generateApiKey();
  const inserted = await db.insert(apiKeys).values({ id: generateId(), organizationId, createdBy: userId, name: parsed.name, prefix: generated.prefix, keyHash: generated.keyHash, scopes: parsed.scopes, expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null }).returning();
  const key = inserted[0];
  if (!key) throw new AppError("INTERNAL_ERROR", "API key could not be created", 500);
  await db.insert(usageRecords).values({ id: generateId(), organizationId, type: "api_request", resourceType: "api_key", resourceId: key.id, metadata: { action: "created" } });
  return { apiKey: toPublic(key), rawKey: generated.rawKey };
}

export async function revokeApiKey(organizationId: string, keyId: string): Promise<void> {
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, organizationId)));
}

export async function authenticateApiKey(rawKey: string, requiredScope?: ApiScope): Promise<ApiKeyContext> {
  const keyHash = hashSecret(rawKey);
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
  const key = rows[0];
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt.getTime() <= Date.now())) throw new AppError("UNAUTHORIZED", "API key is invalid or revoked", 401);
  const scopes = key.scopes.filter((scope): scope is ApiScope => API_SCOPES.includes(scope as ApiScope));
  const context: ApiKeyContext = { apiKey: toPublic(key), organizationId: key.organizationId, scopes };
  if (requiredScope) requireScope(context, requiredScope);
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  return context;
}
