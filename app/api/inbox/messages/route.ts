import { apiFailure, apiSuccess, parseJsonBody } from "@/lib/errors";
import { requireWorkspace } from "@/lib/auth/tenant";
import { sendMessageSchema } from "@/lib/validation/schemas";
import { listTenantMessages, markConversationRead, sendTenantMessage } from "@/services/whatsapp/messages";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireWorkspace();
    const conversationId = new URL(request.url).searchParams.get("conversationId");
    if (!conversationId) return apiSuccess({ messages: [] });
    const messages = await listTenantMessages(context.organization.id, conversationId, 100);
    await markConversationRead(context.organization.id, conversationId);
    return apiSuccess({ messages });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireWorkspace();
    const input = await parseJsonBody(request, sendMessageSchema);
    const message = await sendTenantMessage(context.organization.id, input);
    return apiSuccess({ message }, 201);
  } catch (error) {
    return apiFailure(error);
  }
}
