import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { automationEdges, automationNodes, automations, type Automation, type AutomationEdge, type AutomationNode, type JsonValue } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { constantTimeEqual, encryptSecret, decryptSecret, generateId, generateOpaqueToken } from "@/lib/security/crypto";
import { automationSchema, type AutomationInput } from "@/lib/validation/schemas";
import { executeAutomation } from "@/services/automation/engine";
import { getWhatsappAccount } from "@/services/whatsapp/accounts";

export type PublicAutomation = Omit<Automation, "triggerSecretEncrypted">;
export type AutomationWithGraph = PublicAutomation & { nodes: AutomationNode[]; edges: AutomationEdge[]; triggerSecret?: string };

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

export async function listAutomations(organizationId: string): Promise<PublicAutomation[]> {
  const rows = await db.select().from(automations).where(and(eq(automations.organizationId, organizationId), isNull(automations.deletedAt))).orderBy(desc(automations.updatedAt));
  return rows.map(({ triggerSecretEncrypted: _secret, ...publicAutomation }) => { void _secret; return publicAutomation; });
}

export async function getAutomation(organizationId: string, automationId: string): Promise<AutomationWithGraph> {
  const rows = await db.select().from(automations).where(and(eq(automations.id, automationId), eq(automations.organizationId, organizationId), isNull(automations.deletedAt))).limit(1);
  const automation = rows[0];
  if (!automation) throw new AppError("NOT_FOUND", "Automation not found", 404);
  const [nodes, edges] = await Promise.all([db.select().from(automationNodes).where(eq(automationNodes.automationId, automationId)), db.select().from(automationEdges).where(eq(automationEdges.automationId, automationId))]);
  const { triggerSecretEncrypted: _secret, ...publicAutomation } = automation;
  void _secret;
  return { ...publicAutomation, nodes, edges };
}

export async function createAutomation(organizationId: string, userId: string, input: AutomationInput): Promise<AutomationWithGraph> {
  const parsed = automationSchema.parse(input);
  const nodeIds = new Set(parsed.nodes.map((node) => node.id));
  if (parsed.edges.some((edge) => !nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId))) throw new AppError("INVALID_REQUEST", "Automation edges must reference nodes in the same workflow", 400);
  if (parsed.whatsappAccountId) await getWhatsappAccount(organizationId, parsed.whatsappAccountId);
  const automationId = generateId();
  const triggerSecret = parsed.nodes.some((node) => node.type === "webhook_trigger") ? generateOpaqueToken(32) : undefined;
  await db.transaction(async (transaction) => {
    await transaction.insert(automations).values({ id: automationId, organizationId, whatsappAccountId: parsed.whatsappAccountId ?? null, name: parsed.name, description: parsed.description ?? null, status: parsed.enabled ? "active" : "draft", trigger: asJson(parsed.trigger), triggerSecretEncrypted: triggerSecret ? encryptSecret(triggerSecret) : null, createdBy: userId });
    await transaction.insert(automationNodes).values(parsed.nodes.map((node) => ({ id: node.id, automationId, type: node.type, name: node.name, positionX: node.positionX, positionY: node.positionY, config: asJson(node.config) })));
    if (parsed.edges.length > 0) await transaction.insert(automationEdges).values(parsed.edges.map((edge) => ({ id: generateId(), automationId, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId, condition: edge.condition ?? null })));
  });
  const result = await getAutomation(organizationId, automationId);
  if (triggerSecret) result.triggerSecret = triggerSecret;
  return result;
}

export async function updateAutomation(organizationId: string, automationId: string, input: Partial<AutomationInput>): Promise<AutomationWithGraph> {
  const existing = await getAutomation(organizationId, automationId);
  const parsed = automationSchema.partial().parse(input);
  const nodeIds = new Set((parsed.nodes ?? []).map((node) => node.id));
  if (parsed.edges?.some((edge) => !nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId))) throw new AppError("INVALID_REQUEST", "Automation edges must reference nodes in the same workflow", 400);
  if (parsed.whatsappAccountId) await getWhatsappAccount(organizationId, parsed.whatsappAccountId);
  await db.transaction(async (transaction) => {
    await transaction.update(automations).set({ name: parsed.name ?? existing.name, description: parsed.description ?? existing.description, whatsappAccountId: parsed.whatsappAccountId ?? existing.whatsappAccountId, trigger: parsed.trigger ? asJson(parsed.trigger) : existing.trigger, status: parsed.enabled === undefined ? existing.status : parsed.enabled ? "active" : "paused", updatedAt: new Date() }).where(eq(automations.id, automationId));
    if (parsed.nodes) {
      await transaction.delete(automationEdges).where(eq(automationEdges.automationId, automationId));
      await transaction.delete(automationNodes).where(eq(automationNodes.automationId, automationId));
      await transaction.insert(automationNodes).values(parsed.nodes.map((node) => ({ id: node.id, automationId, type: node.type, name: node.name, positionX: node.positionX, positionY: node.positionY, config: asJson(node.config) })));
      if (parsed.edges?.length) await transaction.insert(automationEdges).values(parsed.edges.map((edge) => ({ id: generateId(), automationId, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId, condition: edge.condition ?? null })));
    }
  });
  return getAutomation(organizationId, automationId);
}

export async function setAutomationEnabled(organizationId: string, automationId: string, enabled: boolean): Promise<void> {
  await getAutomation(organizationId, automationId);
  await db.update(automations).set({ status: enabled ? "active" : "paused", updatedAt: new Date(), lastError: null }).where(and(eq(automations.id, automationId), eq(automations.organizationId, organizationId)));
}

export async function deleteAutomation(organizationId: string, automationId: string): Promise<void> {
  await getAutomation(organizationId, automationId);
  await db.update(automations).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(automations.id, automationId), eq(automations.organizationId, organizationId)));
}

export async function runWebhookAutomationById(input: { automationId: string; secret: string; payload: JsonValue }): Promise<Record<string, JsonValue>> {
  const rows = await db.select({ organizationId: automations.organizationId }).from(automations).where(and(eq(automations.id, input.automationId), isNull(automations.deletedAt))).limit(1);
  const organizationId = rows[0]?.organizationId;
  if (!organizationId) throw new AppError("NOT_FOUND", "Automation not found", 404);
  return runWebhookAutomation({ organizationId, automationId: input.automationId, secret: input.secret, payload: input.payload });
}

export async function runWebhookAutomation(input: { organizationId: string; automationId: string; secret: string; payload: JsonValue }): Promise<Record<string, JsonValue>> {
  const rows = await db.select({ triggerSecretEncrypted: automations.triggerSecretEncrypted }).from(automations).where(and(eq(automations.id, input.automationId), eq(automations.organizationId, input.organizationId), isNull(automations.deletedAt))).limit(1);
  const encryptedSecret = rows[0]?.triggerSecretEncrypted;
  if (!encryptedSecret || !constantTimeEqual(decryptSecret(encryptedSecret), input.secret)) throw new AppError("UNAUTHORIZED", "Automation webhook signature is invalid", 401);
  return executeAutomation({ organizationId: input.organizationId, automationId: input.automationId, context: { webhook: input.payload } });
}
