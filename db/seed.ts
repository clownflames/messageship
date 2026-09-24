import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { automationEdges, automationNodes, automations, campaignRecipients, campaigns, contacts, conversations, messages, organizationMembers, organizations, templates, user, whatsappAccounts, whatsappPhoneNumbers } from "@/db/schema";
import { generateId } from "@/lib/security/crypto";

async function seed() {
  const existing = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, "demo-workspace")).limit(1);
  if (existing[0]) {
    console.info("Demo workspace already exists; seed skipped.");
    return;
  }
  const userId = generateId();
  const organizationId = generateId();
  const accountId = generateId();
  const contactOneId = generateId();
  const contactTwoId = generateId();
  const conversationOneId = generateId();
  const conversationTwoId = generateId();
  const templateId = generateId();
  const campaignId = generateId();
  const automationId = generateId();
  const triggerNodeId = generateId();
  const endNodeId = generateId();
  const now = new Date();
  await db.transaction(async (transaction) => {
    await transaction.insert(user).values({ id: userId, name: "Demo Operator", email: "demo@example.test", emailVerified: true });
    await transaction.insert(organizations).values({ id: organizationId, name: "Demo Workspace", slug: "demo-workspace" });
    await transaction.insert(organizationMembers).values({ id: generateId(), organizationId, userId, role: "owner" });
    await transaction.insert(whatsappAccounts).values({ id: accountId, organizationId, name: "Demo number", businessName: "Demo Business", businessId: "demo_business_id", wabaId: "demo_waba_id", phoneNumberId: "demo_phone_number_id", accessTokenEncrypted: null, status: "pending", connectionMessage: "DEMO DATA ONLY — connect a real Meta account before sending", metadata: { demo: true, notice: "Demo data is not sent through Meta" } });
    await transaction.insert(whatsappPhoneNumbers).values({ id: generateId(), organizationId, whatsappAccountId: accountId, phoneNumberId: "demo_phone_number_id", displayPhoneNumber: "+1 555 000 0001", verifiedName: "Demo Business", status: "demo" });
    await transaction.insert(contacts).values([{ id: contactOneId, organizationId, whatsappAccountId: accountId, name: "Demo Customer One", phoneNumber: "+15550000001", tags: ["demo", "vip"], metadata: { demo: true }, lastInteractionAt: now }, { id: contactTwoId, organizationId, whatsappAccountId: accountId, name: "Demo Customer Two", phoneNumber: "+15550000002", tags: ["demo"], metadata: { demo: true }, lastInteractionAt: now }]);
    await transaction.insert(conversations).values([{ id: conversationOneId, organizationId, whatsappAccountId: accountId, contactId: contactOneId, unreadCount: 1, lastMessageAt: now, lastMessagePreview: "[DEMO DATA] Thanks for reaching out." }, { id: conversationTwoId, organizationId, whatsappAccountId: accountId, contactId: contactTwoId, unreadCount: 0, lastMessageAt: now, lastMessagePreview: "[DEMO DATA] Your order is ready." }]);
    await transaction.insert(messages).values([{ id: generateId(), organizationId, conversationId: conversationOneId, whatsappAccountId: accountId, contactId: contactOneId, externalId: "demo_inbound_1", direction: "inbound", type: "text", status: "delivered", body: "[DEMO DATA] Hello, can you help me?", metadata: { demo: true }, createdAt: now, deliveredAt: now }, { id: generateId(), organizationId, conversationId: conversationOneId, whatsappAccountId: accountId, contactId: contactOneId, externalId: "demo_outbound_1", direction: "outbound", type: "text", status: "read", body: "[DEMO DATA] Thanks for reaching out.", metadata: { demo: true }, createdAt: now, sentAt: now, deliveredAt: now, readAt: now }, { id: generateId(), organizationId, conversationId: conversationTwoId, whatsappAccountId: accountId, contactId: contactTwoId, externalId: "demo_inbound_2", direction: "inbound", type: "text", status: "delivered", body: "[DEMO DATA] Where is my order?", metadata: { demo: true }, createdAt: now, deliveredAt: now }]);
    await transaction.insert(templates).values({ id: templateId, organizationId, whatsappAccountId: accountId, name: "demo_order_update", language: "en", category: "UTILITY", status: "draft", variables: ["{{1}}"] });
    await transaction.insert(automations).values({ id: automationId, organizationId, whatsappAccountId: accountId, name: "Demo automation", description: "DEMO DATA ONLY — no AI provider is configured", status: "draft", trigger: { demo: true }, createdBy: userId });
    await transaction.insert(automationNodes).values([{ id: triggerNodeId, automationId, type: "incoming_message", name: "Incoming message", config: { demo: true } }, { id: endNodeId, automationId, type: "end", name: "End", config: { demo: true } }]);
    await transaction.insert(automationEdges).values({ id: generateId(), automationId, sourceNodeId: triggerNodeId, targetNodeId: endNodeId, condition: null });
    await transaction.insert(campaigns).values({ id: campaignId, organizationId, whatsappAccountId: accountId, templateId, createdBy: userId, name: "Demo campaign", status: "draft", totalRecipients: 2 });
    await transaction.insert(campaignRecipients).values([{ id: generateId(), campaignId, contactId: contactOneId, status: "pending", variables: { "1": "Jordan" } }, { id: generateId(), campaignId, contactId: contactTwoId, status: "pending", variables: { "1": "Taylor" } }]);
  });
  console.info("Seeded demo workspace. Demo messages and records are clearly marked and were not sent through Meta.");
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
