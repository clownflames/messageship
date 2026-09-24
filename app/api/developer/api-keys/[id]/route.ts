import { apiFailure, apiSuccess } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/auth/tenant";
import { recordAudit } from "@/lib/security/audit";
import { revokeApiKey } from "@/services/api/keys";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireWorkspaceRole(["owner", "admin"]);
    const { id } = await params;
    await revokeApiKey(context.organization.id, id);
    await recordAudit({ organizationId: context.organization.id, userId: context.user.id, action: "api_key.revoked", resource: "api_key", resourceId: id });
    return apiSuccess({ revoked: true });
  } catch (error) {
    return apiFailure(error);
  }
}
