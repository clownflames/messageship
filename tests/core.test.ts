import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getOutboundMessagePolicy } from "@/lib/whatsapp/policy";
import { generateApiKey, hashSecret, normalizePhoneNumber } from "@/lib/security/crypto";
import { campaignSchema, contactSchema, loginSchema, sendMessageSchema, signupSchema, templateSchema } from "@/lib/validation/schemas";
import { MetaWhatsAppCloudClient } from "@/lib/whatsapp/client";
import { toMetaComponents } from "@/services/templates/templates";
import { requireScope, type ApiKeyContext } from "@/services/api/keys";
import { verifyMetaSignature } from "@/lib/whatsapp/webhook";
import { Whatsapp } from "@/sdk/index";
import { OpenAICompatibleProvider } from "@/lib/ai/provider";

describe("messaging policy", () => {
  it("allows free-form replies inside the customer-service window", () => {
    const policy = getOutboundMessagePolicy({ type: "text", lastInboundAt: new Date(Date.now() - 60 * 60 * 1000) });
    expect(policy.canSendFreeForm).toBe(true);
    expect(policy.requiresTemplate).toBe(false);
  });

  it("requires an approved template after the window closes", () => {
    const policy = getOutboundMessagePolicy({ type: "text", lastInboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000) });
    expect(policy.canSendFreeForm).toBe(false);
    expect(policy.requiresTemplate).toBe(true);
    expect(policy.reasonMessage).toContain("customer-service window is closed");
  });
});

describe("validation and secret handling", () => {
  it("normalizes international phone numbers", () => {
    expect(normalizePhoneNumber("+1 (555) 010-2000")).toBe("15550102000");
  });

  it("never stores an API key as its raw value", () => {
    const generated = generateApiKey();
    expect(generated.rawKey).toMatch(/^sk_live_/);
    expect(generated.keyHash).toBe(hashSecret(generated.rawKey));
    expect(generated.keyHash).not.toContain(generated.rawKey);
  });

  it("requires a payload matching the selected message type", () => {
    const result = sendMessageSchema.safeParse({ whatsappAccountId: "acct_1", to: "15550102000", type: "text" });
    expect(result.success).toBe(false);
  });

  it("accepts a structured approved-template shape", () => {
    const result = templateSchema.safeParse({ name: "order_update", language: "en", category: "UTILITY", components: [{ type: "BODY", content: "Hello {{1}}" }] });
    expect(result.success).toBe(true);
  });

  it("requires a body and builds Meta variable examples", () => {
    expect(templateSchema.safeParse({ name: "missing_body", language: "en_US", category: "UTILITY", components: [{ type: "HEADER", content: "Header", metadata: {} }] }).success).toBe(false);
    expect(toMetaComponents([{ type: "BODY", content: "Hello {{1}}, order {{2}}", metadata: {} }])).toEqual([{ type: "BODY", text: "Hello {{1}}, order {{2}}", example: { body_text: [["Sample 1", "Sample 2"]] } }]);
  });

  it("validates contact input at the boundary", () => {
    expect(contactSchema.safeParse({ name: "A", phoneNumber: "123" }).success).toBe(false);
  });

  it("enforces password and campaign audience validation", () => {
    expect(signupSchema.safeParse({ name: "A", email: "a@example.com", password: "short" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@example.com", password: "x" }).success).toBe(true);
    expect(campaignSchema.safeParse({ name: "Test", whatsappAccountId: "acct", templateId: "tpl", contactIds: [], variables: {} }).success).toBe(false);
  });
});

describe("API scopes and webhook signatures", () => {
  it("rejects a request missing its required scope", () => {
    const context: ApiKeyContext = { apiKey: { id: "key", organizationId: "org", createdBy: "user", name: "test", prefix: "sk_live_", scopes: [], lastUsedAt: null, expiresAt: null, revokedAt: null, createdAt: new Date() }, organizationId: "org", scopes: [] };
    expect(() => requireScope(context, "messages:write")).toThrow("messages:write");
  });

  it("verifies Meta HMAC signatures", () => {
    process.env.META_APP_SECRET = "test-app-secret";
    const body = JSON.stringify({ object: "whatsapp_business_account" });
    const signature = `sha256=${createHmac("sha256", "test-app-secret").update(body).digest("hex")}`;
    expect(verifyMetaSignature(body, signature)).toBe(true);
    expect(verifyMetaSignature(`${body}x`, signature)).toBe(false);
  });

  it("derives a stable idempotency key for an identical webhook body", () => {
    const first = hashSecret('{"entry":[]}');
    const second = hashSecret('{"entry":[]}');
    expect(first).toBe(second);
    expect(first).not.toBe(hashSecret('{"entry":[{"id":"other"}]}'));
  });

  it("fetches every page of Meta templates", async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = async (input) => {
      requests.push(String(input));
      if (requests.length === 1) {
        const next = new URL(requests[0]);
        next.searchParams.set("after", "cursor");
        return Response.json({ data: [{ id: "tpl_1", name: "first", language: "en_US", status: "APPROVED", components: [] }], paging: { next: next.toString(), cursors: { after: "cursor" } } });
      }
      return Response.json({ data: [{ id: "tpl_2", name: "second", language: "en_US", status: "PENDING", components: [] }] });
    };
    try {
      const templates = await new MetaWhatsAppCloudClient("token").getTemplates("waba");
      expect(templates.map((template) => template.id)).toEqual(["tpl_1", "tpl_2"]);
      expect(requests).toHaveLength(2);
      expect(requests[1]).toContain("after=cursor");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("SDK and provider boundaries", () => {
  it("sends authenticated SDK requests and validates media input", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const sdk = new Whatsapp("sk_live_test", { baseUrl: "https://example.test/api/v1", defaultWhatsappAccountId: "acct_1", fetch: async (input, init) => { requestUrl = String(input); requestInit = init; return Response.json({ success: true, data: { id: "msg_1" } }); } });
    await sdk.messages.sendText({ to: "15550102000", text: "Hello" });
    expect(requestUrl).toBe("https://example.test/api/v1/messages/send");
    expect(new Headers(requestInit?.headers).get("authorization")).toBe("Bearer sk_live_test");
    await expect(sdk.messages.sendImage({ to: "15550102000" })).rejects.toThrow("mediaId or mediaUrl");
  });

  it("uses the provider abstraction instead of provider-specific UI logic", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: "Hello from provider" } }], usage: { prompt_tokens: 1, completion_tokens: 2 } });
    try {
      const provider = new OpenAICompatibleProvider({ apiKey: "test", model: "test-model" }, "https://provider.test/v1", "Test provider");
      const result = await provider.generateText({ messages: [{ role: "user", content: "Hello" }] });
      expect(result.text).toBe("Hello from provider");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
