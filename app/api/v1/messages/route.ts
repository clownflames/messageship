import { apiFailure, apiSuccess } from "@/lib/errors";
import { requireApiContext } from "@/lib/api/auth";
import { listTenantMessages } from "@/services/whatsapp/messages";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "messages:read");
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId") ?? undefined;
    const search = url.searchParams.get("search") ?? undefined;
    const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100) : 50;
    const messages = await listTenantMessages(context.organizationId, conversationId, limit, search);
    return apiSuccess({ messages });
  } catch (error) {
    return apiFailure(error);
  }
}
