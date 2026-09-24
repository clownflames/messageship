import { getMetaConfig } from "@/lib/config";
import { WhatsAppApiError, type WhatsAppBusinessProfile, type WhatsAppContactInput, type WhatsAppLocationInput, type WhatsAppMediaInfo, type WhatsAppMediaInput, type WhatsAppPhoneNumber, type WhatsAppSendResult, type WhatsAppTemplate, type WhatsAppTemplateInput } from "@/lib/whatsapp/types";

export interface WhatsAppCloudClient {
  sendText(input: { phoneNumberId: string; to: string; text: string; previewUrl?: boolean }): Promise<WhatsAppSendResult>;
  sendImage(input: { phoneNumberId: string; to: string; media: WhatsAppMediaInput }): Promise<WhatsAppSendResult>;
  sendVideo(input: { phoneNumberId: string; to: string; media: WhatsAppMediaInput }): Promise<WhatsAppSendResult>;
  sendAudio(input: { phoneNumberId: string; to: string; media: WhatsAppMediaInput }): Promise<WhatsAppSendResult>;
  sendDocument(input: { phoneNumberId: string; to: string; media: WhatsAppMediaInput }): Promise<WhatsAppSendResult>;
  sendLocation(input: { phoneNumberId: string; to: string; location: WhatsAppLocationInput }): Promise<WhatsAppSendResult>;
  sendContacts(input: { phoneNumberId: string; to: string; contacts: WhatsAppContactInput[] }): Promise<WhatsAppSendResult>;
  sendTemplate(input: { phoneNumberId: string; to: string; template: WhatsAppTemplateInput }): Promise<WhatsAppSendResult>;
  getMedia(mediaId: string): Promise<WhatsAppMediaInfo>;
  downloadMedia(mediaId: string): Promise<ArrayBuffer>;
  uploadMedia(input: { appId: string; file: Blob; fileName: string; mimeType: string }): Promise<{ id: string }>;
  getTemplates(wabaId: string): Promise<WhatsAppTemplate[]>;
  createTemplate(wabaId: string, template: WhatsAppTemplateInput & { category: string; components: Array<Record<string, unknown>> }): Promise<{ id: string; status?: string }>;
  updateTemplate(templateId: string, template: { name?: string; language?: string; components?: Array<Record<string, unknown>> }): Promise<{ success: boolean }>;
  deleteTemplate(templateId: string): Promise<{ success: boolean }>;
  getPhoneNumbers(wabaId: string): Promise<WhatsAppPhoneNumber[]>;
  getBusinessProfile(phoneNumberId: string): Promise<WhatsAppBusinessProfile>;
}

type GraphResponse = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export class MetaWhatsAppCloudClient implements WhatsAppCloudClient {
  private readonly baseUrl: string;
  private readonly version: string;
  private readonly accessToken: string;

  constructor(accessToken: string) {
    const config = getMetaConfig();
    this.accessToken = accessToken;
    this.baseUrl = config.apiUrl.replace(/\/$/, "");
    this.version = config.version;
  }

  private async requestUrl<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.accessToken}`);
    if (init.body && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new WhatsAppApiError("Meta could not be reached", 503, "NETWORK_ERROR", null);
    }
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
      throw new WhatsAppApiError(
        readString(error?.message) ?? "Meta rejected the request",
        response.status,
        readString(error?.code) ?? null,
        readString(error?.error_subcode) ?? null,
      );
    }
    return body as T;
  }

  private request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.requestUrl(`${this.baseUrl}/${this.version}${path}`, init);
  }

  private async send(payload: Record<string, unknown>, phoneNumberId: string): Promise<WhatsAppSendResult> {
    const response = await this.request<GraphResponse>(`/${encodeURIComponent(phoneNumberId)}/messages`, { method: "POST", body: JSON.stringify(payload) });
    const messageId = readString(readRecord(readArray(response.messages)[0]).id);
    if (!messageId) {
      throw new WhatsAppApiError("Meta did not return a message id", 502, "INVALID_RESPONSE", null);
    }
    return { messageId };
  }

  sendText(input: { phoneNumberId: string; to: string; text: string; previewUrl?: boolean }): Promise<WhatsAppSendResult> {
    return this.send({ messaging_product: "whatsapp", recipient_type: "individual", to: input.to, type: "text", text: { preview_url: input.previewUrl ?? false, body: input.text } }, input.phoneNumberId);
  }

  sendImage(input: { phoneNumberId: string; to: string; media: WhatsAppMediaInput }): Promise<WhatsAppSendResult> {
    return this.send({ messaging_product: "whatsapp", recipient_type: "individual", to: input.to, type: "image", image: this.mediaPayload(input.media) }, input.phoneNumberId);
  }

  sendVideo(input: { phoneNumberId: string; to: string; media: WhatsAppMediaInput }): Promise<WhatsAppSendResult> {
    return this.send({ messaging_product: "whatsapp", recipient_type: "individual", to: input.to, type: "video", video: this.mediaPayload(input.media) }, input.phoneNumberId);
  }

  sendAudio(input: { phoneNumberId: string; to: string; media: WhatsAppMediaInput }): Promise<WhatsAppSendResult> {
    return this.send({ messaging_product: "whatsapp", recipient_type: "individual", to: input.to, type: "audio", audio: this.mediaPayload(input.media) }, input.phoneNumberId);
  }

  sendDocument(input: { phoneNumberId: string; to: string; media: WhatsAppMediaInput }): Promise<WhatsAppSendResult> {
    return this.send({ messaging_product: "whatsapp", recipient_type: "individual", to: input.to, type: "document", document: this.mediaPayload(input.media) }, input.phoneNumberId);
  }

  sendLocation(input: { phoneNumberId: string; to: string; location: WhatsAppLocationInput }): Promise<WhatsAppSendResult> {
    return this.send({ messaging_product: "whatsapp", recipient_type: "individual", to: input.to, type: "location", location: input.location }, input.phoneNumberId);
  }

  sendContacts(input: { phoneNumberId: string; to: string; contacts: WhatsAppContactInput[] }): Promise<WhatsAppSendResult> {
    return this.send({ messaging_product: "whatsapp", recipient_type: "individual", to: input.to, type: "contacts", contacts: input.contacts }, input.phoneNumberId);
  }

  sendTemplate(input: { phoneNumberId: string; to: string; template: WhatsAppTemplateInput }): Promise<WhatsAppSendResult> {
    return this.send({ messaging_product: "whatsapp", recipient_type: "individual", to: input.to, type: "template", template: input.template }, input.phoneNumberId);
  }

  private mediaPayload(media: WhatsAppMediaInput): Record<string, unknown> {
    if (media.id) return { id: media.id, caption: media.caption };
    if (media.link) return { link: media.link, caption: media.caption, filename: media.filename };
    throw new WhatsAppApiError("Media must include an id or link", 400, "INVALID_MEDIA", null);
  }

  async getMedia(mediaId: string): Promise<WhatsAppMediaInfo> {
    const response = await this.request<GraphResponse>(`/${encodeURIComponent(mediaId)}`);
    return { id: readString(response.id) ?? mediaId, messagingProduct: readString(response.messaging_product), url: readString(response.url), mimeType: readString(response.mime_type), sha256: readString(response.sha256), fileSize: readNumber(response.file_size) };
  }

  async downloadMedia(mediaId: string): Promise<ArrayBuffer> {
    const info = await this.getMedia(mediaId);
    if (!info.url) throw new WhatsAppApiError("Meta did not return a media URL", 502, "INVALID_RESPONSE", null);
    const response = await fetch(info.url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new WhatsAppApiError("Media download failed", response.status, "MEDIA_DOWNLOAD_FAILED", null);
    return response.arrayBuffer();
  }

  async uploadMedia(input: { appId: string; file: Blob; fileName: string; mimeType: string }): Promise<{ id: string }> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", input.file, input.fileName);
    form.append("type", input.mimeType);
    const response = await this.request<GraphResponse>(`/${encodeURIComponent(input.appId)}/media`, { method: "POST", body: form });
    const id = readString(response.id);
    if (!id) throw new WhatsAppApiError("Meta did not return a media id", 502, "INVALID_RESPONSE", null);
    return { id };
  }

  async getTemplates(wabaId: string): Promise<WhatsAppTemplate[]> {
    const templates: WhatsAppTemplate[] = [];
    const query = new URLSearchParams({ fields: "id,name,language,category,status,components,rejected_reason", limit: "100" });
    let nextUrl: string | undefined = `${this.baseUrl}/${this.version}/${encodeURIComponent(wabaId)}/message_templates?${query.toString()}`;
    while (nextUrl) {
      const response = await this.requestUrl<GraphResponse>(nextUrl);
      templates.push(...readArray(response.data).flatMap((item) => {
        if (!isRecord(item)) return [];
        const id = readString(item.id);
        const name = readString(item.name);
        if (!id || !name) return [];
        return [{ id, name, language: readString(item.language) ?? "en", category: readString(item.category), status: readString(item.status), components: readArray(item.components).filter(isRecord), rejectedReason: readString(item.rejected_reason) }];
      }));
      const next = readString(readRecord(response.paging).next);
      if (!next || next === nextUrl) break;
      try {
        const parsed: URL = new URL(next, `${this.baseUrl}/`);
        if (parsed.origin !== new URL(this.baseUrl).origin) throw new Error("unexpected pagination origin");
        nextUrl = parsed.toString();
      } catch {
        throw new WhatsAppApiError("Meta returned an invalid template pagination URL", 502, "INVALID_RESPONSE", null);
      }
    }
    return templates;
  }

  async createTemplate(wabaId: string, template: WhatsAppTemplateInput & { category: string; components: Array<Record<string, unknown>> }): Promise<{ id: string; status?: string }> {
    const response = await this.request<GraphResponse>(`/${encodeURIComponent(wabaId)}/message_templates`, { method: "POST", body: JSON.stringify({ name: template.name, language: template.language, category: template.category, components: template.components }) });
    const id = readString(response.id);
    if (!id) throw new WhatsAppApiError("Meta did not return a template id", 502, "INVALID_RESPONSE", null);
    return { id, status: readString(response.status) };
  }

  async updateTemplate(templateId: string, template: { name?: string; language?: string; components?: Array<Record<string, unknown>> }): Promise<{ success: boolean }> {
    const payload: Record<string, unknown> = {};
    if (template.name !== undefined) payload.name = template.name;
    if (template.language !== undefined) payload.language = template.language;
    if (template.components !== undefined) payload.components = template.components;
    await this.request<GraphResponse>(`/${encodeURIComponent(templateId)}`, { method: "POST", body: JSON.stringify(payload) });
    return { success: true };
  }

  async deleteTemplate(templateId: string): Promise<{ success: boolean }> {
    await this.request<GraphResponse>(`/${encodeURIComponent(templateId)}`, { method: "DELETE" });
    return { success: true };
  }

  async getPhoneNumbers(wabaId: string): Promise<WhatsAppPhoneNumber[]> {
    const response = await this.request<GraphResponse>(`/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status`);
    return readArray(response.data).flatMap((item) => {
      if (!isRecord(item)) return [];
      const id = readString(item.id);
      const displayPhoneNumber = readString(item.display_phone_number);
      if (!id || !displayPhoneNumber) return [];
      return [{ id, displayPhoneNumber, verifiedName: readString(item.verified_name), qualityRating: readString(item.quality_rating), status: readString(item.status) }];
    });
  }

  async getBusinessProfile(phoneNumberId: string): Promise<WhatsAppBusinessProfile> {
    const response = await this.request<GraphResponse>(`/${encodeURIComponent(phoneNumberId)}/whatsapp_business_profile?fields=about,address,description,email,vertical,website`);
    const profile = readArray(response.data)[0];
    if (!isRecord(profile)) return {};
    return { about: readString(profile.about), address: readString(profile.address), description: readString(profile.description), email: readString(profile.email), vertical: readString(profile.vertical), website: readString(profile.website) };
  }
}
