import { z } from "zod";

const id = z.string().trim().min(1).max(128);
const optionalText = z.string().trim().max(10_000).optional();
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{8,30}$/, "Enter a valid phone number");

export const emailSchema = z.string().trim().toLowerCase().email();
export const passwordSchema = z.string().min(8).max(128).regex(/[a-zA-Z]/).regex(/[0-9]/);
export const nameSchema = z.string().trim().min(2).max(120);
export const objectIdSchema = id;

export const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const workspaceSchema = z.object({
  name: nameSchema,
});

export const paginationSchema = z.object({
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
});

export const whatsappAccountConnectionSchema = z.object({
  name: nameSchema,
  businessName: z.string().trim().max(160).optional(),
  businessId: z.string().trim().min(1).max(128),
  wabaId: z.string().trim().min(1).max(128),
  phoneNumberId: z.string().trim().min(1).max(128),
  accessToken: z.string().trim().min(20).max(4096),
});

export const whatsappAccountUpdateSchema = whatsappAccountConnectionSchema.omit({ accessToken: true }).partial();

export const contactSchema = z.object({
  name: nameSchema,
  phoneNumber: phone,
  email: emailSchema.optional().or(z.literal("")),
  notes: optionalText,
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  whatsappAccountId: id.optional(),
});

export const contactUpdateSchema = contactSchema.partial();

export const templateComponentSchema = z.object({
  type: z.enum(["HEADER", "BODY", "FOOTER", "BUTTONS"]),
  content: z.string().trim().min(1).max(4096),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const templateFields = {
  name: z.string().trim().min(1).max(120).regex(/^[a-z0-9_]+$/i, "Use letters, numbers, and underscores only"),
  language: z.string().trim().min(2).max(16),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  components: z.array(templateComponentSchema).min(1).max(20),
  variables: z.array(z.string().regex(/^\{\{[1-9]\d*\}\}$/)).max(20).default([]),
};

export const templateInputSchema = z.object(templateFields);
export const templateSchema = templateInputSchema.superRefine((value, context) => {
  const bodyComponents = value.components.filter((component) => component.type === "BODY");
  if (bodyComponents.length !== 1) {
    context.addIssue({ code: "custom", path: ["components"], message: "A template must contain exactly one body" });
  }
  for (const type of ["HEADER", "FOOTER", "BUTTONS"] as const) {
    if (value.components.filter((component) => component.type === type).length > 1) {
      context.addIssue({ code: "custom", path: ["components"], message: `A template can contain only one ${type.toLowerCase()} component` });
    }
  }
  const body = bodyComponents[0];
  if (body) {
    const numbers = [...body.content.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
    const uniqueNumbers = [...new Set(numbers)].sort((left, right) => left - right);
    if (uniqueNumbers.some((number, index) => number !== index + 1)) {
      context.addIssue({ code: "custom", path: ["components"], message: "Body variables must be sequential and start at {{1}}" });
    }
  }
  const buttons = value.components.find((component) => component.type === "BUTTONS")?.metadata.buttons;
  if (Array.isArray(buttons) && buttons.length > 3) {
    context.addIssue({ code: "custom", path: ["components"], message: "A template can contain at most three quick-reply buttons" });
  }
});

export const templateUpdateSchema = z.object(templateFields).partial();

const mediaFields = {
  mediaUrl: z.url().optional(),
  mediaId: z.string().trim().min(1).max(256).optional(),
  caption: z.string().trim().max(1024).optional(),
  filename: z.string().trim().max(255).optional(),
  mimeType: z.string().trim().max(120).optional(),
  sizeBytes: z.number().int().positive().optional(),
};

export const sendMessageSchema = z.object({
  whatsappAccountId: id,
  to: phone,
  type: z.enum(["text", "image", "video", "audio", "document", "location", "contact", "template"]),
  text: z.object({ body: z.string().trim().min(1).max(4096) }).optional(),
  image: z.object(mediaFields).optional(),
  video: z.object(mediaFields).optional(),
  audio: z.object(mediaFields).optional(),
  document: z.object(mediaFields).optional(),
  location: z.object({ latitude: z.number().finite(), longitude: z.number().finite(), name: z.string().trim().max(120).optional(), address: z.string().trim().max(240).optional() }).optional(),
  contact: z.object({ contacts: z.array(z.record(z.string(), z.string())).min(1).max(100) }).optional(),
  template: z.object({ name: z.string().trim().min(1).max(120), language: z.string().trim().min(2).max(16), components: z.array(z.record(z.string(), z.unknown())).max(20).default([]) }).optional(),
}).superRefine((value, context) => {
  const payload = value[value.type];
  if (!payload) {
    context.addIssue({ code: "custom", path: [value.type], message: `The ${value.type} payload is required` });
  }
});

export const campaignSchema = z.object({
  name: nameSchema,
  whatsappAccountId: id,
  templateId: id,
  contactIds: z.array(id).min(1).max(100_000),
  variables: z.record(z.string(), z.record(z.string(), z.string())).default({}),
  scheduledAt: z.string().datetime().optional(),
});

export const campaignActionSchema = z.object({
  action: z.enum(["send", "pause", "cancel", "retry_failed"]),
});

export const apiKeyCreateSchema = z.object({
  name: nameSchema,
  scopes: z.array(z.enum([
    "messages:read",
    "messages:write",
    "contacts:read",
    "contacts:write",
    "templates:read",
    "templates:write",
    "campaigns:read",
    "campaigns:write",
    "webhooks:read",
    "webhooks:write",
  ])).min(1),
  expiresAt: z.string().datetime().optional(),
});

export const webhookSchema = z.object({
  name: nameSchema,
  url: z.url().refine((value) => new URL(value).protocol === "https:", "Webhook URLs must use HTTPS"),
  events: z.array(z.enum([
    "message.received",
    "message.sent",
    "message.delivered",
    "message.read",
    "message.failed",
    "conversation.created",
    "conversation.updated",
    "contact.created",
    "campaign.completed",
  ])).min(1),
  enabled: z.boolean().default(true),
});

export const aiProviderSchema = z.object({
  name: nameSchema,
  kind: z.enum(["openai", "deepseek", "anthropic", "gemini", "openrouter", "ollama", "openai_compatible"]),
  apiKey: z.string().trim().max(4096).optional(),
  baseUrl: z.url().optional(),
  models: z.array(z.object({ model: z.string().trim().min(1).max(160), displayName: z.string().trim().min(1).max(160) })).default([]),
  enabled: z.boolean().default(true),
});

export const automationSchema = z.object({
  name: nameSchema,
  description: z.string().trim().max(500).optional(),
  whatsappAccountId: id.optional(),
  trigger: z.record(z.string(), z.unknown()).default({}),
  nodes: z.array(z.object({
    id: id,
    type: z.enum(["webhook_trigger", "incoming_message", "condition", "ai", "send_text", "send_template", "send_image", "send_document", "http_request", "delay", "database_action", "set_variable", "end"]),
    name: z.string().trim().min(1).max(120),
    positionX: z.number().int().min(-100_000).max(100_000).default(0),
    positionY: z.number().int().min(-100_000).max(100_000).default(0),
    config: z.record(z.string(), z.unknown()).default({}),
  })).min(1).max(100),
  edges: z.array(z.object({ sourceNodeId: id, targetNodeId: id, condition: z.string().max(500).optional() })).max(200).default([]),
  enabled: z.boolean().default(false),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type WhatsappAccountConnectionInput = z.infer<typeof whatsappAccountConnectionSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type TemplateInput = z.infer<typeof templateSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CampaignInput = z.infer<typeof campaignSchema>;
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;
export type WebhookInput = z.infer<typeof webhookSchema>;
export type AiProviderInput = z.infer<typeof aiProviderSchema>;
export type AutomationInput = z.infer<typeof automationSchema>;
