import { apiFailure, apiSuccess, AppError, invalidRequest } from "@/lib/errors";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { runWebhookAutomationById } from "@/services/automation/automations";
import type { JsonValue } from "@/db/schema";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const limit = checkRateLimit(`automation-trigger:${id}:${ip}`, 60, 60_000);
    if (!limit.allowed) throw new AppError("RATE_LIMITED", "Automation trigger rate limit exceeded", 429);
    const secret = request.headers.get("x-automation-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!secret) throw new AppError("UNAUTHORIZED", "Automation secret is required", 401);
    const rawBody = await request.text();
    if (rawBody.length > 1_000_000) throw invalidRequest("Webhook payload is too large");
    let payload: JsonValue;
    try {
      payload = JSON.parse(rawBody) as JsonValue;
    } catch {
      throw invalidRequest("Webhook payload must be valid JSON");
    }
    return apiSuccess({ result: await runWebhookAutomationById({ automationId: id, secret, payload }) });
  } catch (error) {
    return apiFailure(error);
  }
}
