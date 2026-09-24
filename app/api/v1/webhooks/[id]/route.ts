import { apiFailure, apiSuccess, parseJsonBody } from "@/lib/errors";
import { requireApiContext } from "@/lib/api/auth";
import { webhookSchema } from "@/lib/validation/schemas";
import { deleteWebhook, getWebhook, updateWebhook } from "@/services/webhooks/webhooks";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireApiContext(request, "webhooks:read");
    const { id } = await params;
    return apiSuccess({ webhook: await getWebhook(context.organizationId, id) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireApiContext(request, "webhooks:write");
    const { id } = await params;
    const input = await parseJsonBody(request, webhookSchema.partial());
    return apiSuccess({ webhook: await updateWebhook(context.organizationId, id, input) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireApiContext(request, "webhooks:write");
    const { id } = await params;
    await deleteWebhook(context.organizationId, id);
    return apiSuccess({ deleted: true });
  } catch (error) {
    return apiFailure(error);
  }
}
