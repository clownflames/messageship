import { apiFailure, apiSuccess, parseJsonBody } from "@/lib/errors";
import { requireApiContext } from "@/lib/api/auth";
import { contactUpdateSchema } from "@/lib/validation/schemas";
import { deleteContact, getContact, updateContact } from "@/services/contacts/contacts";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireApiContext(request, "contacts:read");
    const { id } = await params;
    return apiSuccess({ contact: await getContact(context.organizationId, id) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireApiContext(request, "contacts:write");
    const { id } = await params;
    const input = await parseJsonBody(request, contactUpdateSchema);
    return apiSuccess({ contact: await updateContact(context.organizationId, id, input) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireApiContext(request, "contacts:write");
    const { id } = await params;
    await deleteContact(context.organizationId, id);
    return apiSuccess({ deleted: true });
  } catch (error) {
    return apiFailure(error);
  }
}
