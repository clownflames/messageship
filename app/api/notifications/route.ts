import { apiFailure, apiSuccess, parseJsonBody } from "@/lib/errors";
import { requireWorkspace } from "@/lib/auth/tenant";
import { z } from "zod";
import { listNotifications, markNotificationRead } from "@/services/notifications";

export async function GET(): Promise<Response> {
  try {
    const context = await requireWorkspace();
    return apiSuccess({ notifications: await listNotifications(context.organization.id, context.user.id) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const context = await requireWorkspace();
    const body = await parseJsonBody(request, z.object({ notificationId: z.string().min(1) }));
    await markNotificationRead(context.organization.id, context.user.id, body.notificationId);
    return apiSuccess({ read: true });
  } catch (error) {
    return apiFailure(error);
  }
}
