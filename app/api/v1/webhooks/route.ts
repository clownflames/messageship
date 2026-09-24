import { apiFailure, apiSuccess, parseJsonBody } from "@/lib/errors";
import { requireApiContext } from "@/lib/api/auth";
import { webhookSchema } from "@/lib/validation/schemas";
import { createWebhook, listWebhooks } from "@/services/webhooks/webhooks";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "webhooks:read");
    return apiSuccess({ webhooks: await listWebhooks(context.organizationId) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "webhooks:write");
    const input = await parseJsonBody(request, webhookSchema);
    const result = await createWebhook(context.organizationId, context.apiKey.createdBy, input);
    return apiSuccess(result, 201);
  } catch (error) {
    return apiFailure(error);
  }
}
