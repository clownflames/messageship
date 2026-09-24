import { apiFailure, apiSuccess, parseJsonBody } from "@/lib/errors";
import { requireApiContext } from "@/lib/api/auth";
import { contactSchema } from "@/lib/validation/schemas";
import { createContact, listContacts } from "@/services/contacts/contacts";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "contacts:read");
    const url = new URL(request.url);
    const contacts = await listContacts(context.organizationId, { search: url.searchParams.get("search") ?? undefined, limit: Number(url.searchParams.get("limit") ?? 100) });
    return apiSuccess({ contacts });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "contacts:write");
    const input = await parseJsonBody(request, contactSchema);
    const contact = await createContact(context.organizationId, input);
    return apiSuccess({ contact }, 201);
  } catch (error) {
    return apiFailure(error);
  }
}
