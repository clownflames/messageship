import { apiFailure, apiSuccess } from "@/lib/errors";
import { getServerEnv } from "@/lib/config";
import { claimNextJob, completeJob, failJob } from "@/lib/queue/jobs";
import { processCampaignRecipientJob } from "@/services/campaigns/campaigns";
import { triggerIncomingMessageAutomations } from "@/services/automation/engine";
import { deliverWebhook } from "@/services/webhooks/webhooks";
import type { JsonValue } from "@/db/schema";

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const expected = getServerEnv().QUEUE_WORKER_SECRET;
    const provided = request.headers.get("x-queue-secret");
    if (!expected || !provided || provided !== expected) return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Queue worker authentication failed" } }, { status: 401 });
    let processed = 0;
    let failed = 0;
    for (let index = 0; index < 20; index += 1) {
      const job = await claimNextJob();
      if (!job) break;
      try {
        const payload = isRecord(job.payload) ? job.payload : {};
        if (job.type === "campaign_recipient.send" && typeof payload.organizationId === "string" && typeof payload.campaignId === "string" && typeof payload.recipientId === "string") {
          await processCampaignRecipientJob({ organizationId: payload.organizationId, campaignId: payload.campaignId, recipientId: payload.recipientId });
        } else if (job.type === "webhook.deliver" && typeof payload.organizationId === "string" && typeof payload.webhookId === "string" && typeof payload.eventId === "string") {
          await deliverWebhook({ organizationId: payload.organizationId, webhookId: payload.webhookId, eventId: payload.eventId });
        } else if (job.type === "automation.incoming_message" && typeof payload.organizationId === "string" && typeof payload.accountId === "string" && typeof payload.contactId === "string" && typeof payload.conversationId === "string" && typeof payload.messageId === "string") {
          await triggerIncomingMessageAutomations({ organizationId: payload.organizationId, accountId: payload.accountId, contactId: payload.contactId, conversationId: payload.conversationId, messageId: payload.messageId, body: typeof payload.body === "string" ? payload.body : null });
        } else {
          throw new Error(`Unsupported queue job type: ${job.type}`);
        }
        await completeJob(job.id);
        processed += 1;
      } catch (error) {
        failed += 1;
        await failJob(job, error);
      }
    }
    return apiSuccess({ processed, failed });
  } catch (error) {
    return apiFailure(error);
  }
}
