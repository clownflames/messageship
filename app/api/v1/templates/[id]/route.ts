import { apiFailure, apiSuccess, parseJsonBody } from "@/lib/errors";
import { requireApiContext } from "@/lib/api/auth";
import { templateUpdateSchema } from "@/lib/validation/schemas";
import { deleteTemplate, getTemplate, updateTemplate } from "@/services/templates/templates";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireApiContext(request, "templates:read");
    const { id } = await params;
    const template = await getTemplate(context.organizationId, id);
    return apiSuccess({ template });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireApiContext(request, "templates:write");
    const { id } = await params;
    const input = await parseJsonBody(request, templateUpdateSchema);
    return apiSuccess({ template: await updateTemplate(context.organizationId, id, input) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireApiContext(request, "templates:write");
    const { id } = await params;
    await deleteTemplate(context.organizationId, id);
    return apiSuccess({ deleted: true });
  } catch (error) {
    return apiFailure(error);
  }
}
