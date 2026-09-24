import { apiFailure, apiSuccess } from "@/lib/errors";
import { requireApiContext } from "@/lib/api/auth";
import { listTenantConversations } from "@/services/whatsapp/messages";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "messages:read");
    const url = new URL(request.url);
    const conversations = await listTenantConversations(context.organizationId, { accountId: url.searchParams.get("accountId") ?? undefined, search: url.searchParams.get("search") ?? undefined, archived: url.searchParams.get("archived") === "true" });
    return apiSuccess({ conversations });
  } catch (error) {
    return apiFailure(error);
  }
}
