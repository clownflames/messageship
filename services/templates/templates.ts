import { and, desc, eq, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { templateComponents, templates, type JsonValue, type Template } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { generateId } from "@/lib/security/crypto";
import { WhatsAppApiError, type WhatsAppTemplate } from "@/lib/whatsapp/types";
import { createWhatsappClient, getWhatsappAccount } from "@/services/whatsapp/accounts";
import { templateSchema, templateUpdateSchema, type TemplateInput } from "@/lib/validation/schemas";

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
  if (error instanceof WhatsAppApiError) {
    const status = error.status === 400 || error.status === 422 ? 400 : 502;
    throw new AppError(status === 400 ? "INVALID_REQUEST" : "EXTERNAL_SERVICE_ERROR", error.message, status);
  }
  throw error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractVariableNumbers(content: string): number[] {
  return [...content.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
}

function exampleForContent(content: string, type: "HEADER" | "BODY"): Record<string, unknown> | undefined {
  const numbers = extractVariableNumbers(content);
  if (numbers.length === 0) return undefined;
  const values = Array.from({ length: Math.max(...numbers) }, (_, index) => `Sample ${index + 1}`);
  return type === "BODY" ? { body_text: [values] } : { header_text: values };
}

export function toMetaComponents(input: TemplateInput["components"]): Array<Record<string, unknown>> {
  return input.map((component) => {
    if (component.type === "BODY" || component.type === "FOOTER") {
      const example = component.type === "BODY" ? component.metadata.example ?? exampleForContent(component.content, "BODY") : undefined;
      return { type: component.type, text: component.content, ...(example === undefined ? {} : { example }) };
    }
    if (component.type === "HEADER") {
      const format = typeof component.metadata.format === "string" ? component.metadata.format : "TEXT";
      const example = component.metadata.example ?? (format === "TEXT" ? exampleForContent(component.content, "HEADER") : undefined);
      return { type: "HEADER", format, ...(format === "TEXT" ? { text: component.content } : {}), ...(example === undefined ? {} : { example }) };
    }
    const buttons = Array.isArray(component.metadata.buttons) ? component.metadata.buttons : [];
    return { type: "BUTTONS", buttons };
  });
}

function toLocalComponents(components: WhatsAppTemplate["components"]): TemplateInput["components"] {
  const normalized: TemplateInput["components"] = [];
  for (const component of components ?? []) {
    if (!isRecord(component)) continue;
    const type = component.type;
    if (type === "HEADER" || type === "BODY" || type === "FOOTER") {
      const content = typeof component.text === "string" ? component.text : "";
      if (!content) continue;
      const metadata: Record<string, unknown> = {};
      if (type === "HEADER" && typeof component.format === "string") metadata.format = component.format;
      if (component.example !== undefined) metadata.example = component.example;
      normalized.push({ type, content, metadata });
    } else if (type === "BUTTONS") {
      const buttons = Array.isArray(component.buttons) ? component.buttons.filter(isRecord) : [];
      const content = buttons.map((button) => typeof button.text === "string" ? button.text : "").filter(Boolean).join("\n") || "Buttons";
      normalized.push({ type, content, metadata: { buttons } });
    }
  }
  return normalized;
}

function extractVariables(components: TemplateInput["components"]): string[] {
  const numbers = new Set<number>();
  for (const component of components) {
    if (component.type !== "HEADER" && component.type !== "BODY") continue;
    for (const number of extractVariableNumbers(component.content)) numbers.add(number);
  }
  return [...numbers].sort((left, right) => left - right).map((number) => `{{${number}}}`);
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
  const inserted = await db.insert(templates).values({ id: generateId(), organizationId, whatsappAccountId: account.id, externalId: external.id, name: parsed.name, language: parsed.language, category: parsed.category, status: mapStatus(external.status), variables: extractVariables(parsed.components) }).onConflictDoUpdate({
    target: [templates.whatsappAccountId, templates.name, templates.language],
    set: { externalId: external.id, status: mapStatus(external.status), variables: extractVariables(parsed.components), rejectionReason: null, deletedAt: null, updatedAt: new Date() },
  }).returning();
  const template = inserted[0];
  if (!template) throw new AppError("INTERNAL_ERROR", "Template could not be saved", 500);
  await replaceComponents(template.id, parsed.components);
  return getTemplate(organizationId, template.id);
}

export async function updateTemplate(organizationId: string, templateId: string, input: Partial<TemplateInput>): Promise<TemplateWithComponents> {
  const existing = await getTemplate(organizationId, templateId);
  const parsed = templateUpdateSchema.parse(input);
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
    const components = toLocalComponents(item.components);
    const variables = extractVariables(components);
    const synced = await db.insert(templates).values({ id: generateId(), organizationId, whatsappAccountId: account.id, externalId: item.id, name: item.name, language: item.language, category: item.category ?? "UTILITY", status: mapStatus(item.status), variables, rejectionReason: item.rejectedReason ?? null }).onConflictDoUpdate({
      target: [templates.whatsappAccountId, templates.name, templates.language],
      set: { externalId: item.id, category: item.category ?? "UTILITY", status: mapStatus(item.status), variables, rejectionReason: item.rejectedReason ?? null, deletedAt: null, updatedAt: new Date() },
    }).returning({ id: templates.id });
    if (synced[0]) await replaceComponents(synced[0].id, components);
  }
  return listTemplates(organizationId, accountId);
}

export async function duplicateTemplate(organizationId: string, templateId: string, name: string): Promise<TemplateWithComponents> {
  const source = await getTemplate(organizationId, templateId);
  return createTemplate(organizationId, { whatsappAccountId: source.whatsappAccountId, name, language: source.language, category: source.category as "MARKETING" | "UTILITY" | "AUTHENTICATION", variables: source.variables, components: source.components.map((component) => ({ type: component.type as "HEADER" | "BODY" | "FOOTER" | "BUTTONS", content: component.content, metadata: asJsonRecord(component.metadata) })) });
}
