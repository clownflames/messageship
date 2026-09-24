import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { automationEdges, automationNodes, automations, contacts, type AutomationNode, type JsonValue } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { assertSafeRemoteUrl } from "@/lib/security/url";
import { generateWithProvider } from "@/services/ai/providers";
import { sendTenantMessage } from "@/services/whatsapp/messages";
import type { SendMessageInput } from "@/lib/validation/schemas";

type NodeConfig = Record<string, unknown>;
type ExecutionContext = Record<string, JsonValue>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configOf(node: AutomationNode): NodeConfig {
  return isRecord(node.config) ? node.config : {};
}

function readString(config: NodeConfig, key: string): string | undefined {
  return typeof config[key] === "string" ? config[key] : undefined;
}

function readNumber(config: NodeConfig, key: string): number | undefined {
  return typeof config[key] === "number" && Number.isFinite(config[key]) ? config[key] : undefined;
}

function valueFromContext(context: ExecutionContext, expression: string | undefined): JsonValue | undefined {
  if (!expression) return undefined;
  return context[expression.replace(/^\$\{\{|\}\}$/g, "")];
}

function conditionMatches(condition: string | null, context: ExecutionContext): boolean {
  if (!condition) return true;
  const [rawLeft, operator, rawRight] = condition.split(/\s+(==|!=|contains|exists)\s+/);
  if (!rawLeft || !operator) return true;
  const left = valueFromContext(context, rawLeft) ?? rawLeft;
  const right = valueFromContext(context, rawRight) ?? rawRight;
  if (operator === "exists") return left !== undefined && left !== null;
  if (operator == "contains") return String(left).includes(String(right));
  if (operator == "!=") return left !== right;
  return left === right;
}

async function executeNode(input: { organizationId: string; node: AutomationNode; context: ExecutionContext }): Promise<ExecutionContext> {
  const config = configOf(input.node);
  const context = { ...input.context };
  switch (input.node.type) {
    case "webhook_trigger":
    case "incoming_message":
      return context;
    case "set_variable": {
      const key = readString(config, "key");
      if (!key) throw new AppError("INVALID_REQUEST", "Set variable node needs a key", 400);
      context[key] = typeof config.value === "string" || typeof config.value === "number" || typeof config.value === "boolean" || config.value === null ? config.value : JSON.stringify(config.value) as JsonValue;
      return context;
    }
    case "condition":
      return context;
    case "delay": {
      const delay = Math.min(Math.max(readNumber(config, "milliseconds") ?? 1000, 0), 30_000);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      return context;
    }
    case "http_request": {
      const url = readString(config, "url");
      if (!url) throw new AppError("INVALID_REQUEST", "HTTP request node needs a URL", 400);
      const target = await assertSafeRemoteUrl(url);
      const method = readString(config, "method") ?? "POST";
      const response = await fetch(target, { method, headers: { "Content-Type": "application/json", ...(isRecord(config.headers) ? Object.fromEntries(Object.entries(config.headers).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {}) }, body: method === "GET" ? undefined : JSON.stringify(context), signal: AbortSignal.timeout(20_000) });
      context.httpStatus = response.status;
      context.httpBody = (await response.text()).slice(0, 20_000);
      return context;
    }
    case "ai": {
      const providerId = readString(config, "providerId");
      const model = readString(config, "model");
      const prompt = readString(config, "prompt") ?? "{{message.body}}";
      if (!providerId || !model) throw new AppError("INVALID_REQUEST", "AI node needs a provider and model", 400);
      const renderedPrompt = prompt.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => String(valueFromContext(context, key.trim()) ?? ""));
      const result = await generateWithProvider({ organizationId: input.organizationId, providerId, model, messages: [{ role: "user", content: renderedPrompt }], systemPrompt: readString(config, "systemPrompt") });
      context.aiText = result.text;
      context.message = { ...(isRecord(context.message) ? context.message : {}), body: result.text };
      return context;
    }
    case "send_text":
    case "send_template":
    case "send_image":
    case "send_document": {
      const accountId = readString(config, "accountId");
      const to = readString(config, "to")?.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => String(valueFromContext(context, key.trim()) ?? ""));
      if (!accountId || !to) throw new AppError("INVALID_REQUEST", "Message node needs an account and recipient", 400);
      const message: SendMessageInput = input.node.type === "send_text" ? { whatsappAccountId: accountId, to, type: "text", text: { body: readString(config, "text") ?? "" } } : input.node.type === "send_template" ? { whatsappAccountId: accountId, to, type: "template", template: { name: readString(config, "templateName") ?? "", language: readString(config, "language") ?? "en", components: Array.isArray(config.components) ? config.components.filter(isRecord) : [] } } : { whatsappAccountId: accountId, to, type: input.node.type === "send_image" ? "image" : "document", [input.node.type === "send_image" ? "image" : "document"]: { mediaUrl: readString(config, "mediaUrl") ?? "" } };
      const sent = await sendTenantMessage(input.organizationId, message);
      context.lastMessageId = sent.id;
      return context;
    }
    case "database_action": {
      const contactId = readString(config, "contactId");
      if (!contactId) throw new AppError("INVALID_REQUEST", "Database action needs a contact id", 400);
      const action = readString(config, "action") ?? "add_tags";
      if (action === "add_tags" && Array.isArray(config.tags)) {
        const rows = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.organizationId, input.organizationId), isNull(contacts.deletedAt))).limit(1);
        if (!rows[0]) throw new AppError("NOT_FOUND", "Automation contact not found", 404);
        const tags = Array.from(new Set([...rows[0].tags, ...config.tags.filter((tag): tag is string => typeof tag === "string")]));
        await db.update(contacts).set({ tags, updatedAt: new Date() }).where(eq(contacts.id, contactId));
      }
      return context;
    }
    case "end":
      return context;
  }
  return context;
}

export async function executeAutomation(input: { organizationId: string; automationId: string; context: ExecutionContext }): Promise<ExecutionContext> {
  const automationRows = await db.select().from(automations).where(and(eq(automations.id, input.automationId), eq(automations.organizationId, input.organizationId), eq(automations.status, "active"), isNull(automations.deletedAt))).limit(1);
  const automation = automationRows[0];
  if (!automation) throw new AppError("NOT_FOUND", "Active automation not found", 404);
  const nodes = await db.select().from(automationNodes).where(eq(automationNodes.automationId, automation.id));
  const edges = await db.select().from(automationEdges).where(eq(automationEdges.automationId, automation.id));
  const outgoing = new Map<string, typeof edges>();
  for (const edge of edges) outgoing.set(edge.sourceNodeId, [...(outgoing.get(edge.sourceNodeId) ?? []), edge]);
  let current = nodes.filter((node) => node.type === "webhook_trigger" || node.type === "incoming_message");
  const context = { ...input.context };
  for (let step = 0; step < 100 && current.length > 0; step += 1) {
    const node = current[0];
    if (!node) break;
    const result = await executeNode({ organizationId: input.organizationId, node, context });
    Object.assign(context, result);
    const edge = (outgoing.get(node.id) ?? []).find((candidate) => conditionMatches(candidate.condition, context));
    if (!edge) break;
    current = nodes.filter((candidate) => candidate.id === edge.targetNodeId);
  }
  await db.update(automations).set({ lastRunAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(automations.id, automation.id));
  return context;
}

export async function triggerIncomingMessageAutomations(input: { organizationId: string; accountId: string; contactId: string; conversationId: string; messageId: string; body: string | null }): Promise<void> {
  const rows = await db.select().from(automations).where(and(eq(automations.organizationId, input.organizationId), eq(automations.whatsappAccountId, input.accountId), eq(automations.status, "active"), isNull(automations.deletedAt)));
  for (const automation of rows) {
    const nodes = await db.select().from(automationNodes).where(eq(automationNodes.automationId, automation.id));
    if (!nodes.some((node) => node.type === "incoming_message")) continue;
    const contactRows = await db.select({ phoneNumber: contacts.phoneNumber }).from(contacts).where(and(eq(contacts.id, input.contactId), eq(contacts.organizationId, input.organizationId))).limit(1);
    await executeAutomation({ organizationId: input.organizationId, automationId: automation.id, context: { contactId: input.contactId, to: contactRows[0]?.phoneNumber ?? "", conversationId: input.conversationId, messageId: input.messageId, message: { body: input.body ?? "" }, accountId: input.accountId } });
  }
}
