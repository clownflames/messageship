import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { contacts, type Contact } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { generateId, normalizePhoneNumber } from "@/lib/security/crypto";
import { contactSchema, type ContactInput } from "@/lib/validation/schemas";

export type ContactWithMeta = Contact;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

function headerIndex(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.includes(header.trim().toLowerCase()));
}

export async function listContacts(organizationId: string, input: { search?: string; limit?: number } = {}): Promise<ContactWithMeta[]> {
  const search = input.search?.trim();
  const filters = [eq(contacts.organizationId, organizationId), isNull(contacts.deletedAt)];
  if (search) filters.push(or(ilike(contacts.name, `%${search}%`), ilike(contacts.phoneNumber, `%${search}%`), ilike(contacts.email, `%${search}%`)) as never);
  return db.select().from(contacts).where(and(...filters)).orderBy(desc(contacts.updatedAt)).limit(Math.min(input.limit ?? 100, 500));
}

export async function getContact(organizationId: string, contactId: string): Promise<Contact> {
  const rows = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.organizationId, organizationId), isNull(contacts.deletedAt))).limit(1);
  const contact = rows[0];
  if (!contact) throw new AppError("NOT_FOUND", "Contact not found", 404);
  return contact;
}

export async function createContact(organizationId: string, input: ContactInput): Promise<Contact> {
  const parsed = contactSchema.parse(input);
  const phoneNumber = normalizePhoneNumber(parsed.phoneNumber);
  const existing = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.phoneNumber, phoneNumber), isNull(contacts.deletedAt))).limit(1);
  if (existing[0]) throw new AppError("CONFLICT", "A contact with this WhatsApp number already exists", 409);
  const inserted = await db.insert(contacts).values({ id: generateId(), organizationId, whatsappAccountId: parsed.whatsappAccountId ?? null, name: parsed.name, phoneNumber, email: parsed.email || null, notes: parsed.notes ?? null, tags: parsed.tags }).returning();
  const contact = inserted[0];
  if (!contact) throw new AppError("INTERNAL_ERROR", "Contact could not be created", 500);
  return contact;
}

export async function updateContact(organizationId: string, contactId: string, input: Partial<ContactInput>): Promise<Contact> {
  await getContact(organizationId, contactId);
  const parsed = contactSchema.partial().parse(input);
  const values: Partial<typeof contacts.$inferInsert> = { updatedAt: new Date() };
  if (parsed.name !== undefined) values.name = parsed.name;
  if (parsed.phoneNumber !== undefined) values.phoneNumber = normalizePhoneNumber(parsed.phoneNumber);
  if (parsed.email !== undefined) values.email = parsed.email || null;
  if (parsed.notes !== undefined) values.notes = parsed.notes ?? null;
  if (parsed.tags !== undefined) values.tags = parsed.tags;
  if (parsed.whatsappAccountId !== undefined) values.whatsappAccountId = parsed.whatsappAccountId;
  const updated = await db.update(contacts).set(values).where(and(eq(contacts.id, contactId), eq(contacts.organizationId, organizationId))).returning();
  const contact = updated[0];
  if (!contact) throw new AppError("NOT_FOUND", "Contact not found", 404);
  return contact;
}

export async function deleteContact(organizationId: string, contactId: string): Promise<void> {
  await getContact(organizationId, contactId);
  await db.update(contacts).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(contacts.id, contactId), eq(contacts.organizationId, organizationId)));
}

export type ContactImportPreviewRow = { row: number; name?: string; phoneNumber?: string; email?: string; notes?: string; tags: string[]; valid: boolean; duplicate: boolean; error?: string };

export async function previewContactImport(organizationId: string, csv: string): Promise<{ headers: string[]; rows: ContactImportPreviewRow[]; validCount: number; duplicateCount: number; invalidCount: number }> {
  if (csv.length > 5 * 1024 * 1024) throw new AppError("INVALID_REQUEST", "CSV files must be smaller than 5 MB", 400);
  const parsedRows = parseCsv(csv.replace(/^\uFEFF/, ""));
  const headers = (parsedRows.shift() ?? []).map((header) => header.toLowerCase());
  const nameIndex = headerIndex(headers, ["name", "full name", "contact name"]);
  const phoneIndex = headerIndex(headers, ["phone", "phone number", "whatsapp", "mobile"]);
  const emailIndex = headerIndex(headers, ["email", "email address"]);
  const notesIndex = headerIndex(headers, ["notes", "note"]);
  const tagsIndex = headerIndex(headers, ["tags", "labels"]);
  if (nameIndex < 0 || phoneIndex < 0) throw new AppError("INVALID_REQUEST", "CSV must include name and phone number columns", 400);
  const existing = await db.select({ phoneNumber: contacts.phoneNumber }).from(contacts).where(and(eq(contacts.organizationId, organizationId), isNull(contacts.deletedAt)));
  const existingNumbers = new Set(existing.map((row) => row.phoneNumber));
  const seen = new Set<string>();
  const rows = parsedRows.map((row, index) => {
    const name = row[nameIndex];
    const phoneNumber = row[phoneIndex];
    let normalized: string | undefined;
    let error: string | undefined;
    try {
      normalized = normalizePhoneNumber(phoneNumber ?? "");
      if (seen.has(normalized)) error = "Duplicate row in this file";
      seen.add(normalized);
    } catch {
      error = "Invalid phone number";
    }
    const duplicate = normalized ? existingNumbers.has(normalized) : false;
    return { row: index + 2, name, phoneNumber: normalized ?? phoneNumber, email: emailIndex >= 0 ? row[emailIndex] : undefined, notes: notesIndex >= 0 ? row[notesIndex] : undefined, tags: tagsIndex >= 0 && row[tagsIndex] ? row[tagsIndex].split(/[|;]/).map((tag) => tag.trim()).filter(Boolean) : [], valid: !error && !duplicate, duplicate, error };
  });
  return { headers, rows, validCount: rows.filter((row) => row.valid).length, duplicateCount: rows.filter((row) => row.duplicate).length, invalidCount: rows.filter((row) => !row.valid && !row.duplicate).length };
}

export async function importContacts(organizationId: string, csv: string): Promise<{ imported: number; skipped: number }> {
  const preview = await previewContactImport(organizationId, csv);
  const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
  rows.shift();
  let imported = 0;
  for (const row of preview.rows) {
    if (!row.valid || !row.phoneNumber || !row.name) continue;
    await db.insert(contacts).values({ id: generateId(), organizationId, name: row.name, phoneNumber: row.phoneNumber, email: row.email || null, notes: row.notes || null, tags: row.tags });
    imported += 1;
  }
  return { imported, skipped: preview.rows.length - imported };
}
