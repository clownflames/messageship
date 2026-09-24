import { apiFailure, apiSuccess } from "@/lib/errors";
import { requireApiContext } from "@/lib/api/auth";
import { listTenantMessages, markConversationRead } from "@/services/whatsapp/messages";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireApiContext(request, "messages:read");
    const { id } = await params;
    const messages = await listTenantMessages(context.organizationId, id, 100);
    await markConversationRead(context.organizationId, id);
    return apiSuccess({ messages });
  } catch (error) {
    return apiFailure(error);
  }
}
