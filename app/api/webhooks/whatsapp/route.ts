import { constantTimeEqual } from "@/lib/security/crypto";
import { apiFailure } from "@/lib/errors";
import { getWhatsappVerificationToken, processMetaWebhook, verifyMetaSignature } from "@/lib/whatsapp/webhook";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  try {
    if (mode === "subscribe" && token && challenge && constantTimeEqual(token, getWhatsappVerificationToken())) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
  } catch {
    return new Response("Verification unavailable", { status: 503 });
  }
  return new Response("Verification failed", { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const rawBody = await request.text();
    if (rawBody.length > 5 * 1024 * 1024) return Response.json({ success: false, error: { code: "INVALID_REQUEST", message: "Webhook body is too large" } }, { status: 413 });
    if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
      return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid webhook signature" } }, { status: 401 });
    }
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      return Response.json({ success: false, error: { code: "INVALID_REQUEST", message: "Webhook body must be valid JSON" } }, { status: 400 });
    }
    const result = await processMetaWebhook(rawBody, payload);
    return Response.json({ success: true, data: { duplicate: result.duplicate } });
  } catch (error) {
    return apiFailure(error);
  }
}
