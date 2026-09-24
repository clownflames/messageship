import { apiFailure, apiSuccess, invalidRequest } from "@/lib/errors";
import { requireApiContext } from "@/lib/api/auth";
import { sendMessageSchema } from "@/lib/validation/schemas";
import { sendTenantMessage } from "@/services/whatsapp/messages";
import { resolveWhatsappAccountId } from "@/services/whatsapp/accounts";

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "messages:write");
    const body: unknown = await request.json().catch(() => { throw invalidRequest("Request body must be valid JSON"); });
    if (!isRecord(body)) throw invalidRequest("Request body must be an object");
    const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId : undefined;
    const accountId = await resolveWhatsappAccountId(context.organizationId, typeof body.whatsappAccountId === "string" ? body.whatsappAccountId : undefined, phoneNumberId);
    const input = sendMessageSchema.parse({ ...body, whatsappAccountId: accountId });
    const message = await sendTenantMessage(context.organizationId, input);
    return apiSuccess({ message }, 201);
  } catch (error) {
    return apiFailure(error);
  }
}
