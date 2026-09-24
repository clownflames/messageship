import { apiFailure, apiSuccess, parseJsonBody } from "@/lib/errors";
import { requireApiContext } from "@/lib/api/auth";
import { whatsappAccountConnectionSchema } from "@/lib/validation/schemas";
import { connectWhatsappAccount, listWhatsappAccounts } from "@/services/whatsapp/accounts";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "messages:read");
    return apiSuccess({ accounts: await listWhatsappAccounts(context.organizationId) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "messages:write");
    const input = await parseJsonBody(request, whatsappAccountConnectionSchema);
    const account = await connectWhatsappAccount(context.organizationId, input);
    return apiSuccess({ account }, 201);
  } catch (error) {
    return apiFailure(error);
  }
}
