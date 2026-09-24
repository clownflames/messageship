import { z } from "zod";
import { apiFailure, apiSuccess, parseJsonBody } from "@/lib/errors";
import { requireApiContext } from "@/lib/api/auth";
import { templateSchema } from "@/lib/validation/schemas";
import { createTemplate, listTemplates } from "@/services/templates/templates";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "templates:read");
    const url = new URL(request.url);
    const templates = await listTemplates(context.organizationId, url.searchParams.get("accountId") ?? undefined, url.searchParams.get("search") ?? undefined);
    return apiSuccess({ templates });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "templates:write");
    const body = await parseJsonBody(request, templateSchema.extend({ whatsappAccountId: z.string().trim().min(1) }));
    const { whatsappAccountId, ...input } = body;
    const template = await createTemplate(context.organizationId, { ...input, whatsappAccountId });
    return apiSuccess({ template }, 201);
  } catch (error) {
    return apiFailure(error);
  }
}
