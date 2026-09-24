import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull();

export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member", "viewer"]);
export const connectionStatusEnum = pgEnum("connection_status", ["connected", "pending", "error", "disconnected"]);
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const messageTypeEnum = pgEnum("message_type", ["text", "image", "video", "audio", "document", "location", "contact", "template", "system"]);
export const messageStatusEnum = pgEnum("message_status", ["sending", "sent", "delivered", "read", "failed"]);
export const templateStatusEnum = pgEnum("template_status", ["draft", "pending", "approved", "rejected", "paused", "unknown"]);
export const campaignStatusEnum = pgEnum("campaign_status", ["draft", "scheduled", "running", "paused", "completed", "cancelled", "failed"]);
export const recipientStatusEnum = pgEnum("recipient_status", ["pending", "sending", "sent", "delivered", "read", "failed", "skipped"]);
export const automationStatusEnum = pgEnum("automation_status", ["draft", "active", "paused", "error"]);
export const automationNodeTypeEnum = pgEnum("automation_node_type", ["webhook_trigger", "incoming_message", "condition", "ai", "send_text", "send_template", "send_image", "send_document", "http_request", "delay", "database_action", "set_variable", "end"]);
export const jobStatusEnum = pgEnum("job_status", ["queued", "processing", "completed", "failed", "cancelled"]);
export const usageTypeEnum = pgEnum("usage_type", ["message", "ai_request", "api_request", "media_upload", "automation_run"]);
export const notificationTypeEnum = pgEnum("notification_type", ["campaign_completed", "campaign_failed", "connection_problem", "webhook_error", "api_error", "template_status", "automation_error"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [uniqueIndex("user_email_idx").on(table.email)]);

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  token: text("token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [uniqueIndex("session_token_idx").on(table.token), index("session_user_id_idx").on(table.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true, mode: "date" }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true, mode: "date" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [index("account_user_id_idx").on(table.userId), uniqueIndex("account_provider_account_idx").on(table.providerId, table.accountId)]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (table) => [uniqueIndex("organizations_slug_idx").on(table.slug), index("organizations_deleted_at_idx").on(table.deletedAt)]);

export const organizationMembers = pgTable("organization_members", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: memberRoleEnum("role").default("owner").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("organization_members_org_user_idx").on(table.organizationId, table.userId), index("organization_members_user_id_idx").on(table.userId)]);

export const whatsappAccounts = pgTable("whatsapp_accounts", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  businessName: text("business_name"),
  businessId: text("business_id"),
  wabaId: text("waba_id"),
  phoneNumberId: text("phone_number_id"),
  accessTokenEncrypted: text("access_token_encrypted"),
  status: connectionStatusEnum("status").default("pending").notNull(),
  connectionMessage: text("connection_message"),
  metadata: jsonb("metadata").$type<JsonValue>().default({}).notNull(),
  lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (table) => [index("whatsapp_accounts_org_idx").on(table.organizationId), index("whatsapp_accounts_phone_number_idx").on(table.phoneNumberId), index("whatsapp_accounts_waba_idx").on(table.wabaId)]);

export const whatsappPhoneNumbers = pgTable("whatsapp_phone_numbers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  whatsappAccountId: text("whatsapp_account_id").notNull().references(() => whatsappAccounts.id, { onDelete: "cascade" }),
  phoneNumberId: text("phone_number_id").notNull(),
  displayPhoneNumber: text("display_phone_number").notNull(),
  verifiedName: text("verified_name"),
  status: text("status").default("active").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("whatsapp_phone_numbers_org_phone_idx").on(table.organizationId, table.phoneNumberId), index("whatsapp_phone_numbers_account_idx").on(table.whatsappAccountId)]);

export const contacts = pgTable("contacts", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  whatsappAccountId: text("whatsapp_account_id").references(() => whatsappAccounts.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  email: text("email"),
  notes: text("notes"),
  tags: jsonb("tags").$type<string[]>().default([]).notNull(),
  metadata: jsonb("metadata").$type<JsonValue>().default({}).notNull(),
  lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (table) => [uniqueIndex("contacts_org_phone_idx").on(table.organizationId, table.phoneNumber), index("contacts_org_name_idx").on(table.organizationId, table.name), index("contacts_deleted_at_idx").on(table.deletedAt)]);

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  whatsappAccountId: text("whatsapp_account_id").notNull().references(() => whatsappAccounts.id, { onDelete: "cascade" }),
  contactId: text("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  status: text("status").default("open").notNull(),
  starred: boolean("starred").default(false).notNull(),
  archived: boolean("archived").default(false).notNull(),
  assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
  unreadCount: integer("unread_count").default(0).notNull(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: "date" }),
  lastMessagePreview: text("last_message_preview"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (table) => [uniqueIndex("conversations_account_contact_idx").on(table.whatsappAccountId, table.contactId), index("conversations_org_updated_idx").on(table.organizationId, table.updatedAt), index("conversations_org_last_message_idx").on(table.organizationId, table.lastMessageAt)]);

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  whatsappAccountId: text("whatsapp_account_id").notNull().references(() => whatsappAccounts.id, { onDelete: "cascade" }),
  contactId: text("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  direction: messageDirectionEnum("direction").notNull(),
  type: messageTypeEnum("type").notNull(),
  status: messageStatusEnum("status").default("sending").notNull(),
  body: text("body"),
  metadata: jsonb("metadata").$type<JsonValue>().default({}).notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "date" }),
  readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
  failedAt: timestamp("failed_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("messages_account_external_idx").on(table.whatsappAccountId, table.externalId), index("messages_conversation_created_idx").on(table.conversationId, table.createdAt), index("messages_org_created_idx").on(table.organizationId, table.createdAt), index("messages_body_idx").on(table.body)]);

export const messageMedia = pgTable("message_media", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  mediaUrl: text("media_url").notNull(),
  mimeType: text("mime_type"),
  fileName: text("file_name"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  sha256: text("sha256"),
  createdAt: createdAt(),
}, (table) => [index("message_media_message_idx").on(table.messageId)]);

export const templates = pgTable("templates", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  whatsappAccountId: text("whatsapp_account_id").notNull().references(() => whatsappAccounts.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  name: text("name").notNull(),
  language: text("language").notNull(),
  category: text("category").notNull(),
  status: templateStatusEnum("status").default("draft").notNull(),
  variables: jsonb("variables").$type<string[]>().default([]).notNull(),
  rejectionReason: text("rejection_reason"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (table) => [uniqueIndex("templates_account_name_language_idx").on(table.whatsappAccountId, table.name, table.language), index("templates_org_status_idx").on(table.organizationId, table.status), index("templates_org_name_idx").on(table.organizationId, table.name)]);

export const templateComponents = pgTable("template_components", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull().references(() => templates.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  content: text("content").notNull(),
  position: integer("position").default(0).notNull(),
  metadata: jsonb("metadata").$type<JsonValue>().default({}).notNull(),
  createdAt: createdAt(),
}, (table) => [index("template_components_template_idx").on(table.templateId, table.position)]);

export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  whatsappAccountId: text("whatsapp_account_id").notNull().references(() => whatsappAccounts.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull().references(() => templates.id, { onDelete: "restrict" }),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  status: campaignStatusEnum("status").default("draft").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: "date" }),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  totalRecipients: integer("total_recipients").default(0).notNull(),
  sentCount: integer("sent_count").default(0).notNull(),
  deliveredCount: integer("delivered_count").default(0).notNull(),
  readCount: integer("read_count").default(0).notNull(),
  failedCount: integer("failed_count").default(0).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("campaigns_org_status_idx").on(table.organizationId, table.status), index("campaigns_account_idx").on(table.whatsappAccountId), index("campaigns_org_name_idx").on(table.organizationId, table.name)]);

export const campaignRecipients = pgTable("campaign_recipients", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  contactId: text("contact_id").notNull().references(() => contacts.id, { onDelete: "restrict" }),
  externalMessageId: text("external_message_id"),
  status: recipientStatusEnum("status").default("pending").notNull(),
  variables: jsonb("variables").$type<Record<string, string>>().default({}).notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "date" }),
  readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
  failedAt: timestamp("failed_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("campaign_recipients_campaign_contact_idx").on(table.campaignId, table.contactId), index("campaign_recipients_status_idx").on(table.campaignId, table.status)]);

export const automations = pgTable("automations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  whatsappAccountId: text("whatsapp_account_id").references(() => whatsappAccounts.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  status: automationStatusEnum("status").default("draft").notNull(),
  trigger: jsonb("trigger").$type<JsonValue>().default({}).notNull(),
  triggerSecretEncrypted: text("trigger_secret_encrypted"),
  version: integer("version").default(1).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: "date" }),
  lastError: text("last_error"),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (table) => [index("automations_org_status_idx").on(table.organizationId, table.status)]);

export const automationNodes = pgTable("automation_nodes", {
  id: text("id").primaryKey(),
  automationId: text("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
  type: automationNodeTypeEnum("type").notNull(),
  name: text("name").notNull(),
  positionX: integer("position_x").default(0).notNull(),
  positionY: integer("position_y").default(0).notNull(),
  config: jsonb("config").$type<JsonValue>().default({}).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("automation_nodes_automation_idx").on(table.automationId)]);

export const automationEdges = pgTable("automation_edges", {
  id: text("id").primaryKey(),
  automationId: text("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
  sourceNodeId: text("source_node_id").notNull().references(() => automationNodes.id, { onDelete: "cascade" }),
  targetNodeId: text("target_node_id").notNull().references(() => automationNodes.id, { onDelete: "cascade" }),
  condition: text("condition"),
  createdAt: createdAt(),
}, (table) => [index("automation_edges_automation_idx").on(table.automationId)]);

export const aiProviders = pgTable("ai_providers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  baseUrl: text("base_url"),
  apiKeyEncrypted: text("api_key_encrypted"),
  enabled: boolean("enabled").default(true).notNull(),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (table) => [uniqueIndex("ai_providers_org_name_idx").on(table.organizationId, table.name), index("ai_providers_org_enabled_idx").on(table.organizationId, table.enabled)]);

export const aiModels = pgTable("ai_models", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull().references(() => aiProviders.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  displayName: text("display_name").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("ai_models_provider_model_idx").on(table.providerId, table.model)]);

export const aiConfigurations = pgTable("ai_configurations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull().references(() => aiProviders.id, { onDelete: "cascade" }),
  modelId: text("model_id").references(() => aiModels.id, { onDelete: "set null" }),
  temperature: text("temperature").default("0.7").notNull(),
  systemPrompt: text("system_prompt"),
  maxTokens: integer("max_tokens"),
  metadata: jsonb("metadata").$type<JsonValue>().default({}).notNull(),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("ai_configurations_org_idx").on(table.organizationId)]);

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("api_keys_hash_idx").on(table.keyHash), uniqueIndex("api_keys_org_name_idx").on(table.organizationId, table.name), index("api_keys_org_idx").on(table.organizationId)]);

export const webhooks = pgTable("webhooks", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  events: jsonb("events").$type<string[]>().notNull(),
  secretEncrypted: text("secret_encrypted").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true, mode: "date" }),
  lastDeliveryStatus: text("last_delivery_status"),
  failureCount: integer("failure_count").default(0).notNull(),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("webhooks_org_url_idx").on(table.organizationId, table.url), index("webhooks_org_enabled_idx").on(table.organizationId, table.enabled)]);

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  webhookId: text("webhook_id").references(() => webhooks.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").$type<JsonValue>().notNull(),
  status: text("status").default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  responseStatus: integer("response_status"),
  errorMessage: text("error_message"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
}, (table) => [index("webhook_events_org_created_idx").on(table.organizationId, table.createdAt), index("webhook_events_status_idx").on(table.status)]);

export const metaWebhookEvents = pgTable("meta_webhook_events", {
  id: text("id").primaryKey(),
  providerEventId: text("provider_event_id").notNull(),
  payload: jsonb("payload").$type<JsonValue>().notNull(),
  status: text("status").default("processing").notNull(),
  errorMessage: text("error_message"),
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
}, (table) => [uniqueIndex("meta_webhook_events_provider_event_idx").on(table.providerEventId), index("meta_webhook_events_status_idx").on(table.status)]);

export const usageRecords = pgTable("usage_records", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  type: usageTypeEnum("type").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  quantity: integer("quantity").default(1).notNull(),
  metadata: jsonb("metadata").$type<JsonValue>().default({}).notNull(),
  createdAt: createdAt(),
}, (table) => [index("usage_records_org_created_idx").on(table.organizationId, table.createdAt), index("usage_records_type_idx").on(table.type)]);

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata").$type<JsonValue>().default({}).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
}, (table) => [index("audit_logs_org_created_idx").on(table.organizationId, table.createdAt), index("audit_logs_resource_idx").on(table.resource, table.resourceId)]);

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
  metadata: jsonb("metadata").$type<JsonValue>().default({}).notNull(),
  createdAt: createdAt(),
}, (table) => [index("notifications_user_created_idx").on(table.userId, table.createdAt), index("notifications_org_created_idx").on(table.organizationId, table.createdAt)]);

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<JsonValue>().notNull(),
  status: jobStatusEnum("status").default("queued").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(5).notNull(),
  runAt: timestamp("run_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("jobs_queue_idx").on(table.status, table.runAt), index("jobs_org_idx").on(table.organizationId)]);

export const authSchema = { user, session, account, verification };

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type WhatsappAccount = typeof whatsappAccounts.$inferSelect;
export type WhatsappPhoneNumber = typeof whatsappPhoneNumbers.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CampaignRecipient = typeof campaignRecipients.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type AutomationNode = typeof automationNodes.$inferSelect;
export type AutomationEdge = typeof automationEdges.$inferSelect;
export type AiProvider = typeof aiProviders.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type MetaWebhookEvent = typeof metaWebhookEvents.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Notification = typeof notifications.$inferSelect;

