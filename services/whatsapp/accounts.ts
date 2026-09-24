import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { messages, whatsappAccounts, whatsappPhoneNumbers, type WhatsappAccount } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { encryptSecret, decryptSecret, generateId } from "@/lib/security/crypto";
import { MetaWhatsAppCloudClient } from "@/lib/whatsapp/client";
import { WhatsAppApiError } from "@/lib/whatsapp/types";
import type { WhatsappAccountConnectionInput } from "@/lib/validation/schemas";

export type PublicWhatsappAccount = Omit<WhatsappAccount, "accessTokenEncrypted">;

function toPublicAccount(account: WhatsappAccount): PublicWhatsappAccount {
  return {
    id: account.id,
    organizationId: account.organizationId,
    name: account.name,
    businessName: account.businessName,
    businessId: account.businessId,
    wabaId: account.wabaId,
    phoneNumberId: account.phoneNumberId,
    status: account.status,
    connectionMessage: account.connectionMessage,
    metadata: account.metadata,
    lastWebhookAt: account.lastWebhookAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    deletedAt: account.deletedAt,
  };
}

function mapExternalError(error: unknown): never {
  if (error instanceof WhatsAppApiError) {
    throw new AppError("EXTERNAL_SERVICE_ERROR", error.message, 502);
  }
  throw error;
}

export async function listWhatsappAccounts(organizationId: string): Promise<PublicWhatsappAccount[]> {
  return db.select({
    id: whatsappAccounts.id,
    organizationId: whatsappAccounts.organizationId,
    name: whatsappAccounts.name,
    businessName: whatsappAccounts.businessName,
    businessId: whatsappAccounts.businessId,
    wabaId: whatsappAccounts.wabaId,
    phoneNumberId: whatsappAccounts.phoneNumberId,
    status: whatsappAccounts.status,
    connectionMessage: whatsappAccounts.connectionMessage,
    metadata: whatsappAccounts.metadata,
    lastWebhookAt: whatsappAccounts.lastWebhookAt,
    createdAt: whatsappAccounts.createdAt,
    updatedAt: whatsappAccounts.updatedAt,
    deletedAt: whatsappAccounts.deletedAt,
  }).from(whatsappAccounts).where(and(eq(whatsappAccounts.organizationId, organizationId), isNull(whatsappAccounts.deletedAt))).orderBy(desc(whatsappAccounts.createdAt));
}

export async function connectWhatsappAccount(organizationId: string, input: WhatsappAccountConnectionInput): Promise<PublicWhatsappAccount> {
  let phoneNumbers;
  let profile;
  try {
    const client = new MetaWhatsAppCloudClient(input.accessToken);
    [phoneNumbers, profile] = await Promise.all([client.getPhoneNumbers(input.wabaId), client.getBusinessProfile(input.phoneNumberId)]);
  } catch (error) {
    return mapExternalError(error);
  }
  const matchedNumber = phoneNumbers.find((phoneNumber) => phoneNumber.id === input.phoneNumberId);
  if (!matchedNumber) {
    throw new AppError("INVALID_REQUEST", "The phone number ID is not registered under this WhatsApp Business Account", 400);
  }
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(profile)) {
    if (value) metadata[key] = value;
  }
  const accountId = generateId();
  const account = await db.transaction(async (transaction) => {
    const rows = await transaction.insert(whatsappAccounts).values({
      id: accountId,
      organizationId,
      name: input.name,
      businessName: input.businessName ?? matchedNumber.verifiedName ?? null,
      businessId: input.businessId,
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      accessTokenEncrypted: encryptSecret(input.accessToken),
      status: "connected",
      connectionMessage: "Connected and verified",
      metadata,
    }).returning();
    const created = rows[0];
    if (!created) throw new Error("WhatsApp account could not be created");
    await transaction.insert(whatsappPhoneNumbers).values({
      id: generateId(),
      organizationId,
      whatsappAccountId: created.id,
      phoneNumberId: matchedNumber.id,
      displayPhoneNumber: matchedNumber.displayPhoneNumber,
      verifiedName: matchedNumber.verifiedName ?? null,
      status: matchedNumber.status ?? "active",
    });
    return toPublicAccount(created);
  });
  return account;
}

export async function getWhatsappAccountMessageCounts(organizationId: string): Promise<Record<string, number>> {
  const rows = await db.select({ accountId: messages.whatsappAccountId, total: count() }).from(messages).where(eq(messages.organizationId, organizationId)).groupBy(messages.whatsappAccountId);
  return Object.fromEntries(rows.map((row) => [row.accountId, row.total]));
}

export async function getWhatsappAccount(organizationId: string, accountId: string): Promise<WhatsappAccount> {
  const rows = await db.select().from(whatsappAccounts).where(and(eq(whatsappAccounts.id, accountId), eq(whatsappAccounts.organizationId, organizationId), isNull(whatsappAccounts.deletedAt))).limit(1);
  const account = rows[0];
  if (!account) throw new AppError("NOT_FOUND", "WhatsApp account not found", 404);
  return account;
}

export async function resolveWhatsappAccountId(organizationId: string, requestedId?: string, phoneNumberId?: string): Promise<string> {
  if (requestedId) return (await getWhatsappAccount(organizationId, requestedId)).id;
  if (phoneNumberId) {
    const rows = await db.select({ id: whatsappAccounts.id }).from(whatsappAccounts).where(and(eq(whatsappAccounts.organizationId, organizationId), eq(whatsappAccounts.phoneNumberId, phoneNumberId), isNull(whatsappAccounts.deletedAt))).limit(1);
    if (rows[0]) return rows[0].id;
  }
  const accounts = await listWhatsappAccounts(organizationId);
  if (accounts.length === 1) return accounts[0].id;
  throw new AppError("INVALID_REQUEST", "Specify whatsappAccountId when the workspace has multiple connected accounts", 400);
}

export function createWhatsappClient(account: WhatsappAccount): MetaWhatsAppCloudClient {
  if (!account.accessTokenEncrypted) throw new AppError("CONFLICT", "This WhatsApp account has no connected access token", 409);
  return new MetaWhatsAppCloudClient(decryptSecret(account.accessTokenEncrypted));
}

export async function disconnectWhatsappAccount(organizationId: string, accountId: string): Promise<void> {
  await db.update(whatsappAccounts).set({ status: "disconnected", connectionMessage: "Disconnected by workspace administrator", deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(whatsappAccounts.id, accountId), eq(whatsappAccounts.organizationId, organizationId), isNull(whatsappAccounts.deletedAt)));
}

export async function refreshWhatsappAccount(organizationId: string, accountId: string): Promise<PublicWhatsappAccount> {
  const account = await getWhatsappAccount(organizationId, accountId);
  if (!account.wabaId || !account.phoneNumberId) throw new AppError("INVALID_REQUEST", "This account is missing Meta identifiers", 409);
  try {
    const client = createWhatsappClient(account);
    const [numbers, profile] = await Promise.all([client.getPhoneNumbers(account.wabaId), client.getBusinessProfile(account.phoneNumberId)]);
    const matched = numbers.find((number) => number.id === account.phoneNumberId);
    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(profile)) if (value) metadata[key] = value;
    await db.update(whatsappAccounts).set({ businessName: matched?.verifiedName ?? account.businessName, status: "connected", connectionMessage: "Metadata refreshed", metadata, updatedAt: new Date() }).where(and(eq(whatsappAccounts.id, accountId), eq(whatsappAccounts.organizationId, organizationId)));
  } catch (error) {
    if (error instanceof WhatsAppApiError) {
      await db.update(whatsappAccounts).set({ status: "error", connectionMessage: error.message, updatedAt: new Date() }).where(and(eq(whatsappAccounts.id, accountId), eq(whatsappAccounts.organizationId, organizationId)));
      throw new AppError("EXTERNAL_SERVICE_ERROR", error.message, 502);
    }
    throw error;
  }
  return toPublicAccount(await getWhatsappAccount(organizationId, accountId));
}
