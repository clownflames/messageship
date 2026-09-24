import { and, desc, eq, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { templateComponents, templates, type JsonValue, type Template } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { generateId } from "@/lib/security/crypto";
import { WhatsAppApiError } from "@/lib/whatsapp/types";
import { createWhatsappClient, getWhatsappAccount } from "@/services/whatsapp/accounts";
import { templateSchema, type TemplateInput } from "@/lib/validation/schemas";

export type TemplateWithComponents = Template & { components: Array<typeof templateComponents.$inferSelect> };

function asJsonRecord(value: JsonValue): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

function asJsonValue(value: Record<string, unknown>): JsonValue {
  return value as JsonValue;
}

function mapStatus(status: string | undefined): "draft" | "pending" | "approved" | "rejected" | "paused" | "unknown" {
  switch (status?.toUpperCase()) {
    case "APPROVED": return "approved";
    case "PENDING":
    case "PENDING_DELETION": return "pending";
    case "REJECTED":
    case "DISAPPROVED": return "rejected";
    case "PAUSED": return "paused";
    default: return "unknown";
  }
}

function mapExternalError(error: unknown): never {
  if (error instanceof WhatsAppApiError) throw new AppError("EXTERNAL_SERVICE_ERROR", error.message, 502);
  throw error;
}

function toMetaComponents(input: TemplateInput["components"]): Array<Record<string, unknown>> {
  return input.map((component) => {
    if (component.type === "BODY") return { type: "BODY", text: { body: component.content } };
    if (component.type === "FOOTER") return { type: "FOOTER", text: { body: component.content } };
    if (component.type === "HEADER") {
      const format = typeof component.metadata.format === "string" ? component.metadata.format : "TEXT";
      return { type: "HEADER", format, text: format === "TEXT" ? { body: component.content } : undefined, example: component.metadata.example };
    }
    const buttons = Array.isArray(component.metadata.buttons) ? component.metadata.buttons : [];
    return { type: "BUTTONS", buttons };
  });
}

async function attachComponents(rows: Template[]): Promise<TemplateWithComponents[]> {
  if (rows.length === 0) return [];
  const components = await db.select().from(templateComponents).where(and(...rows.map((row) => eq(templateComponents.templateId, row.id))));
  return rows.map((row) => ({ ...row, components: components.filter((component) => component.templateId === row.id).sort((left, right) => left.position - right.position) }));
}

export async function listTemplates(organizationId: string, accountId?: string, search?: string): Promise<TemplateWithComponents[]> {
  const filters = [eq(templates.organizationId, organizationId), isNull(templates.deletedAt)];
  if (accountId) filters.push(eq(templates.whatsappAccountId, accountId));
  if (search?.trim()) filters.push(ilike(templates.name, `%${search.trim()}%`));
  const rows = await db.select().from(templates).where(and(...filters)).orderBy(desc(templates.updatedAt));
  return attachComponents(rows);
}

export async function getTemplate(organizationId: string, templateId: string): Promise<TemplateWithComponents> {
  const rows = await db.select().from(templates).where(and(eq(templates.id, templateId), eq(templates.organizationId, organizationId), isNull(templates.deletedAt))).limit(1);
  if (!rows[0]) throw new AppError("NOT_FOUND", "Template not found", 404);
  const [result] = await attachComponents(rows);
  if (!result) throw new AppError("NOT_FOUND", "Template not found", 404);
  return result;
}

async function replaceComponents(templateId: string, input: TemplateInput["components"]): Promise<void> {
  await db.delete(templateComponents).where(eq(templateComponents.templateId, templateId));
  if (input.length === 0) return;
  await db.insert(templateComponents).values(input.map((component, position) => ({ id: generateId(), templateId, type: component.type, content: component.content, position, metadata: asJsonValue(component.metadata) })));
}

export async function createTemplate(organizationId: string, input: TemplateInput & { whatsappAccountId: string }): Promise<TemplateWithComponents> {
  const parsed = templateSchema.parse(input);
  const account = await getWhatsappAccount(organizationId, input.whatsappAccountId);
  if (!account.wabaId) throw new AppError("INVALID_REQUEST", "The account does not have a WhatsApp Business Account ID", 409);
  let external;
  try {
    external = await createWhatsappClient(account).createTemplate(account.wabaId, { name: parsed.name, language: parsed.language, category: parsed.category, components: toMetaComponents(parsed.components) });
  } catch (error) {
    return mapExternalError(error);
  }
  const inserted = await db.insert(templates).values({ id: generateId(), organizationId, whatsappAccountId: account.id, externalId: external.id, name: parsed.name, language: parsed.language, category: parsed.category, status: mapStatus(external.status), variables: parsed.variables }).returning();
  const template = inserted[0];
  if (!template) throw new AppError("INTERNAL_ERROR", "Template could not be saved", 500);
  await replaceComponents(template.id, parsed.components);
  return getTemplate(organizationId, template.id);
}

export async function updateTemplate(organizationId: string, templateId: string, input: Partial<TemplateInput>): Promise<TemplateWithComponents> {
  const existing = await getTemplate(organizationId, templateId);
  const parsed = templateSchema.partial().parse(input);
  if (parsed.name && parsed.name !== existing.name && existing.status !== "draft") throw new AppError("INVALID_REQUEST", "Submitted templates cannot be renamed", 422);
  if (existing.externalId) {
    try {
      await createWhatsappClient(await getWhatsappAccount(organizationId, existing.whatsappAccountId)).updateTemplate(existing.externalId, { name: parsed.name, language: parsed.language, components: parsed.components ? toMetaComponents(parsed.components) : undefined });
    } catch (error) {
      return mapExternalError(error);
    }
  }
  await db.update(templates).set({ name: parsed.name ?? existing.name, language: parsed.language ?? existing.language, category: parsed.category ?? existing.category, variables: parsed.variables ?? existing.variables, updatedAt: new Date() }).where(and(eq(templates.id, templateId), eq(templates.organizationId, organizationId)));
  if (parsed.components) await replaceComponents(templateId, parsed.components);
  return getTemplate(organizationId, templateId);
}

export async function deleteTemplate(organizationId: string, templateId: string): Promise<void> {
  const template = await getTemplate(organizationId, templateId);
  if (template.externalId) {
    try {
      await createWhatsappClient(await getWhatsappAccount(organizationId, template.whatsappAccountId)).deleteTemplate(template.externalId);
    } catch (error) {
      return mapExternalError(error);
    }
  }
  await db.update(templates).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(templates.id, templateId), eq(templates.organizationId, organizationId)));
}

export async function refreshTemplateStatuses(organizationId: string, accountId: string): Promise<TemplateWithComponents[]> {
  const account = await getWhatsappAccount(organizationId, accountId);
  if (!account.wabaId) throw new AppError("INVALID_REQUEST", "The account does not have a WhatsApp Business Account ID", 409);
  let remote;
  try {
    remote = await createWhatsappClient(account).getTemplates(account.wabaId);
  } catch (error) {
    return mapExternalError(error);
  }
  for (const item of remote) {
    const existing = await db.select({ id: templates.id }).from(templates).where(and(eq(templates.organizationId, organizationId), eq(templates.externalId, item.id))).limit(1);
    if (existing[0]) {
      await db.update(templates).set({ status: mapStatus(item.status), rejectionReason: item.rejectedReason ?? null, updatedAt: new Date() }).where(eq(templates.id, existing[0].id));
    } else {
      await db.insert(templates).values({ id: generateId(), organizationId, whatsappAccountId: account.id, externalId: item.id, name: item.name, language: item.language, category: item.category ?? "UTILITY", status: mapStatus(item.status), variables: [], rejectionReason: item.rejectedReason ?? null });
    }
  }
  return listTemplates(organizationId, accountId);
}

export async function duplicateTemplate(organizationId: string, templateId: string, name: string): Promise<TemplateWithComponents> {
  const source = await getTemplate(organizationId, templateId);
  return createTemplate(organizationId, { whatsappAccountId: source.whatsappAccountId, name, language: source.language, category: source.category as "MARKETING" | "UTILITY" | "AUTHENTICATION", variables: source.variables, components: source.components.map((component) => ({ type: component.type as "HEADER" | "BODY" | "FOOTER" | "BUTTONS", content: component.content, metadata: asJsonRecord(component.metadata) })) });
}
