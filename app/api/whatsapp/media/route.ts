import { apiFailure, apiSuccess, AppError } from "@/lib/errors";
import { requireWorkspace } from "@/lib/auth/tenant";
import { getServerEnv } from "@/lib/config";
import { assertFileSignature } from "@/lib/security/file";
import { validateMediaFile } from "@/services/whatsapp/messages";
import { createWhatsappClient, getWhatsappAccount } from "@/services/whatsapp/accounts";

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireWorkspace();
    const form = await request.formData();
    const accountId = String(form.get("accountId") ?? "");
    const type = String(form.get("type") ?? "");
    const file = form.get("file");
    if (!accountId || !["image", "video", "audio", "document"].includes(type)) throw new AppError("INVALID_REQUEST", "Account and media type are required", 400);
    if (!(file instanceof File)) throw new AppError("INVALID_REQUEST", "A media file is required", 400);
    validateMediaFile(type, file.type, file.size);
    const bytes = new Uint8Array(await file.arrayBuffer());
    assertFileSignature(bytes, file.type);
    const account = await getWhatsappAccount(context.organization.id, accountId);
    const appId = getServerEnv().META_APP_ID;
    if (!appId) throw new AppError("INVALID_REQUEST", "META_APP_ID is not configured", 400);
    const result = await createWhatsappClient(account).uploadMedia({ appId, file: new Blob([bytes], { type: file.type }), fileName: file.name, mimeType: file.type });
    return apiSuccess(result, 201);
  } catch (error) {
    return apiFailure(error);
  }
}
