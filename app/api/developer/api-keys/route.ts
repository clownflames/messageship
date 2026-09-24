import { apiFailure, apiSuccess, parseJsonBody } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/auth/tenant";
import { recordAudit } from "@/lib/security/audit";
import { apiKeyCreateSchema } from "@/lib/validation/schemas";
import { createApiKey, listApiKeys } from "@/services/api/keys";

export async function GET(): Promise<Response> {
  try {
    const context = await requireWorkspaceRole(["owner", "admin"]);
    return apiSuccess({ apiKeys: await listApiKeys(context.organization.id) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireWorkspaceRole(["owner", "admin"]);
    const input = await parseJsonBody(request, apiKeyCreateSchema);
    const result = await createApiKey(context.organization.id, context.user.id, input);
    await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "api_key.created", resource: "api_key", resourceId: result.apiKey.id });
    return apiSuccess(result, 201);
  } catch (error) {
    return apiFailure(error);
  }
}
