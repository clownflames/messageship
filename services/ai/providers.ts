import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { aiConfigurations, aiModels, aiProviders, usageRecords, type AiProvider } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { createAIProvider as createRuntimeAIProvider, type AIProvider as RuntimeAIProvider } from "@/lib/ai/provider";
import { decryptSecret, encryptSecret, generateId } from "@/lib/security/crypto";
import { aiProviderSchema, type AiProviderInput } from "@/lib/validation/schemas";

export type PublicAIProvider = Omit<AiProvider, "apiKeyEncrypted">;

function toPublic(provider: AiProvider): PublicAIProvider {
  return { id: provider.id, organizationId: provider.organizationId, name: provider.name, kind: provider.kind, baseUrl: provider.baseUrl, enabled: provider.enabled, createdBy: provider.createdBy, createdAt: provider.createdAt, updatedAt: provider.updatedAt, deletedAt: provider.deletedAt };
}

export async function listAIProviders(organizationId: string): Promise<PublicAIProvider[]> {
  const rows = await db.select().from(aiProviders).where(and(eq(aiProviders.organizationId, organizationId), isNull(aiProviders.deletedAt))).orderBy(desc(aiProviders.createdAt));
  return rows.map(toPublic);
}

export async function createAIProvider(organizationId: string, userId: string, input: AiProviderInput): Promise<PublicAIProvider> {
  const parsed = aiProviderSchema.parse(input);
  const inserted = await db.transaction(async (transaction) => {
    const providerRows = await transaction.insert(aiProviders).values({ id: generateId(), organizationId, name: parsed.name, kind: parsed.kind, baseUrl: parsed.baseUrl ?? null, apiKeyEncrypted: parsed.apiKey ? encryptSecret(parsed.apiKey) : null, enabled: parsed.enabled, createdBy: userId }).returning();
    const provider = providerRows[0];
    if (!provider) throw new AppError("INTERNAL_ERROR", "AI provider could not be created", 500);
    if (parsed.models.length > 0) await transaction.insert(aiModels).values(parsed.models.map((model) => ({ id: generateId(), organizationId, providerId: provider.id, model: model.model, displayName: model.displayName })));
    return provider;
  });
  return toPublic(inserted);
}

export async function updateAIProvider(organizationId: string, providerId: string, input: Partial<AiProviderInput>): Promise<PublicAIProvider> {
  const rows = await db.select().from(aiProviders).where(and(eq(aiProviders.id, providerId), eq(aiProviders.organizationId, organizationId), isNull(aiProviders.deletedAt))).limit(1);
  const provider = rows[0];
  if (!provider) throw new AppError("NOT_FOUND", "AI provider not found", 404);
  const parsed = aiProviderSchema.partial().parse(input);
  const updated = await db.update(aiProviders).set({ name: parsed.name ?? provider.name, kind: parsed.kind ?? provider.kind, baseUrl: parsed.baseUrl ?? provider.baseUrl, apiKeyEncrypted: parsed.apiKey ? encryptSecret(parsed.apiKey) : provider.apiKeyEncrypted, enabled: parsed.enabled ?? provider.enabled, updatedAt: new Date() }).where(and(eq(aiProviders.id, providerId), eq(aiProviders.organizationId, organizationId))).returning();
  const result = updated[0];
  if (!result) throw new AppError("NOT_FOUND", "AI provider not found", 404);
  return toPublic(result);
}

export async function deleteAIProvider(organizationId: string, providerId: string): Promise<void> {
  await db.update(aiProviders).set({ enabled: false, deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(aiProviders.id, providerId), eq(aiProviders.organizationId, organizationId)));
}

export async function generateWithProvider(input: { organizationId: string; providerId: string; model: string; messages: Parameters<RuntimeAIProvider["generateText"]>[0]["messages"]; systemPrompt?: string; temperature?: number; maxTokens?: number }): Promise<{ text: string; model: string }> {
  const rows = await db.select().from(aiProviders).where(and(eq(aiProviders.id, input.providerId), eq(aiProviders.organizationId, input.organizationId), eq(aiProviders.enabled, true), isNull(aiProviders.deletedAt))).limit(1);
  const provider = rows[0];
  if (!provider) throw new AppError("NOT_FOUND", "AI provider not found", 404);
  const apiKey = provider.apiKeyEncrypted ? decryptSecret(provider.apiKeyEncrypted) : "";
  const runtime = createRuntimeAIProvider(provider.kind, { apiKey, baseUrl: provider.baseUrl, model: input.model, temperature: input.temperature, maxTokens: input.maxTokens, systemPrompt: input.systemPrompt });
  const result = await runtime.generateText({ messages: input.systemPrompt ? [{ role: "system", content: input.systemPrompt }, ...input.messages] : input.messages, temperature: input.temperature, maxTokens: input.maxTokens });
  await db.insert(usageRecords).values({ id: generateId(), organizationId: input.organizationId, type: "ai_request", resourceType: "ai_provider", resourceId: provider.id, metadata: { model: input.model } });
  return { text: result.text, model: result.model };
}

export async function listAIConfigurations(organizationId: string) {
  return db.select().from(aiConfigurations).where(eq(aiConfigurations.organizationId, organizationId)).orderBy(desc(aiConfigurations.updatedAt));
}
