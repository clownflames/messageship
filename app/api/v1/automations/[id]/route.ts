import { apiFailure, apiSuccess, parseJsonBody } from "@/lib/errors";
import { requireApiContext } from "@/lib/api/auth";
import { automationSchema } from "@/lib/validation/schemas";
import { deleteAutomation, getAutomation, updateAutomation } from "@/services/automation/automations";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireApiContext(request, "messages:read");
    const { id } = await params;
    return apiSuccess({ automation: await getAutomation(context.organizationId, id) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireApiContext(request, "messages:write");
    const { id } = await params;
    const input = await parseJsonBody(request, automationSchema.partial());
    return apiSuccess({ automation: await updateAutomation(context.organizationId, id, input) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireApiContext(request, "messages:write");
    const { id } = await params;
    await deleteAutomation(context.organizationId, id);
    return apiSuccess({ deleted: true });
  } catch (error) {
    return apiFailure(error);
  }
}
