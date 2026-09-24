import { apiFailure, apiSuccess, parseJsonBody } from "@/lib/errors";
import { requireApiContext } from "@/lib/api/auth";
import { campaignSchema } from "@/lib/validation/schemas";
import { createCampaign, listCampaigns } from "@/services/campaigns/campaigns";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "campaigns:read");
    const search = new URL(request.url).searchParams.get("search") ?? undefined;
    return apiSuccess({ campaigns: await listCampaigns(context.organizationId, search) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "campaigns:write");
    const input = await parseJsonBody(request, campaignSchema);
    const campaign = await createCampaign(context.organizationId, context.apiKey.createdBy, input);
    return apiSuccess({ campaign }, 201);
  } catch (error) {
    return apiFailure(error);
  }
}
