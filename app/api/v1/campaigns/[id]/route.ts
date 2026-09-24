import { apiFailure, apiSuccess, parseJsonBody } from "@/lib/errors";
import { requireApiContext } from "@/lib/api/auth";
import { campaignActionSchema } from "@/lib/validation/schemas";
import { cancelCampaign, getCampaign, getCampaignStats, pauseCampaign, retryFailedCampaign } from "@/services/campaigns/campaigns";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireApiContext(request, "campaigns:read");
    const { id } = await params;
    return apiSuccess({ campaign: await getCampaign(context.organizationId, id), statistics: await getCampaignStats(context.organizationId, id) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireApiContext(request, "campaigns:write");
    const { id } = await params;
    const input = await parseJsonBody(request, campaignActionSchema);
    if (input.action === "pause") await pauseCampaign(context.organizationId, id);
    if (input.action === "cancel") await cancelCampaign(context.organizationId, id);
    if (input.action === "retry_failed") await retryFailedCampaign(context.organizationId, id);
    return apiSuccess({ campaign: await getCampaign(context.organizationId, id) });
  } catch (error) {
    return apiFailure(error);
  }
}
