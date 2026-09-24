import { apiFailure, apiSuccess, parseJsonBody } from "@/lib/errors";
import { requireApiContext } from "@/lib/api/auth";
import { automationSchema } from "@/lib/validation/schemas";
import { createAutomation, listAutomations } from "@/services/automation/automations";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "messages:read");
    return apiSuccess({ automations: await listAutomations(context.organizationId) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "messages:write");
    const input = await parseJsonBody(request, automationSchema);
    const automation = await createAutomation(context.organizationId, context.apiKey.createdBy, input);
    return apiSuccess({ automation }, 201);
  } catch (error) {
    return apiFailure(error);
  }
}
