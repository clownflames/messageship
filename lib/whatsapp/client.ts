import { GraphApiError, WhatsAppClient, type SendMessageResponse } from "@kapso/whatsapp-cloud-api";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readAfterCursor(next: string | null | undefined): string | undefined {
  if (!next) return undefined;
  try {
    return new URL(next, "https://graph.facebook.com").searchParams.get("after") ?? undefined;
  } catch {
    return undefined;
  }
}

function normalizeProviderError(error: unknown): never {
  if (error instanceof WhatsAppApiError) throw error;
  if (error instanceof GraphApiError) {
    throw new WhatsAppApiError(error.message, error.httpStatus, String(error.code), error.errorSubcode == null ? null : String(error.errorSubcode));
  }
  if (error instanceof Error && (error.name === "AbortError" || error instanceof TypeError)) {
    throw new WhatsAppApiError("Meta could not be reached", 503, "NETWORK_ERROR", null);
  }
  if (error instanceof Error) {
    throw new WhatsAppApiError(error.message, 400, "INVALID_REQUEST", null);
  }
  throw error;
}

type ProviderResponse = { messages: Array<{ id?: string }> };

export class MetaWhatsAppCloudClient implements WhatsAppCloudClient {
  private readonly client: WhatsAppClient;

  constructor(accessToken: string, fetchImpl?: typeof fetch) {
    const config = getMetaConfig();
    const requestFetch: typeof fetch = fetchImpl ?? globalThis.fetch;
    const timedFetch: typeof fetch = (input, init) => requestFetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(30_000) });
    this.client = new WhatsAppClient({
      accessToken,
      baseUrl: config.apiUrl,
      graphVersion: config.version,
      fetch: timedFetch,
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      return normalizeProviderError(error);
    }
  }

  private messageResult(response: ProviderResponse): WhatsAppSendResult {
    const messageId = response.messages[0]?.id;
    if (!messageId) throw new WhatsAppApiError("WhatsApp did not return a message id", 502, "INVALID_RESPONSE", null);
    return { messageId };
  }

  private async sendMessage(operation: () => Promise<SendMessageResponse>): Promise<WhatsAppSendResult> {
    return this.messageResult(await this.execute(operation));
  }

  private mediaPayload(media: WhatsAppMediaInput): { id?: string; link?: string; caption?: string; filename?: string } {
    if (!media.id && !media.link) throw new WhatsAppApiError("Media must include an id or link", 400, "INVALID_MEDIA", null);
    return { id: media.id, link: media.link, caption: media.caption, filename: media.filename };
  }

  sendText(input: { phoneNumberId: string; to: string; text: string; previewUrl?: boolean }): Promise<WhatsAppSendResult> {
    return this.sendMessage(() => this.client.messages.sendText({ phoneNumberId: input.phoneNumberId, to: input.to, body: input.text, previewUrl: input.previewUrl }));
  }

  sendImage(input: { phoneNumberId: string; to: string; media: WhatsAppMediaInput }): Promise<WhatsAppSendResult> {
    return this.sendMessage(() => this.client.messages.sendImage({ phoneNumberId: input.phoneNumberId, to: input.to, image: this.mediaPayload(input.media) }));
  }

  sendVideo(input: { phoneNumberId: string; to: string; media: WhatsAppMediaInput }): Promise<WhatsAppSendResult> {
    return this.sendMessage(() => this.client.messages.sendVideo({ phoneNumberId: input.phoneNumberId, to: input.to, video: this.mediaPayload(input.media) }));
  }

  sendAudio(input: { phoneNumberId: string; to: string; media: WhatsAppMediaInput }): Promise<WhatsAppSendResult> {
    return this.sendMessage(() => this.client.messages.sendAudio({ phoneNumberId: input.phoneNumberId, to: input.to, audio: this.mediaPayload(input.media) }));
  }

  sendDocument(input: { phoneNumberId: string; to: string; media: WhatsAppMediaInput }): Promise<WhatsAppSendResult> {
    return this.sendMessage(() => this.client.messages.sendDocument({ phoneNumberId: input.phoneNumberId, to: input.to, document: this.mediaPayload(input.media) }));
  }

  sendLocation(input: { phoneNumberId: string; to: string; location: WhatsAppLocationInput }): Promise<WhatsAppSendResult> {
    return this.sendMessage(() => this.client.messages.sendLocation({ phoneNumberId: input.phoneNumberId, to: input.to, location: input.location }));
  }

  sendContacts(input: { phoneNumberId: string; to: string; contacts: WhatsAppContactInput[] }): Promise<WhatsAppSendResult> {
    return this.sendMessage(() => this.client.messages.sendRaw({ phoneNumberId: input.phoneNumberId, payload: { messaging_product: "whatsapp", recipient_type: "individual", to: input.to, type: "contacts", contacts: input.contacts } }));
  }

  sendTemplate(input: { phoneNumberId: string; to: string; template: WhatsAppTemplateInput }): Promise<WhatsAppSendResult> {
    const components = input.template.components?.map((component) => ({ ...component, type: String(component.type) }));
    return this.sendMessage(() => this.client.messages.sendTemplate({ phoneNumberId: input.phoneNumberId, to: input.to, template: { name: input.template.name, language: { code: input.template.language }, ...(components ? { components } : {}) } }));
  }

  async getMedia(mediaId: string): Promise<WhatsAppMediaInfo> {
    const info = await this.execute(() => this.client.media.get({ mediaId }));
    const fileSize = Number(info.fileSize);
    return { id: info.id ?? mediaId, messagingProduct: info.messagingProduct, url: info.url ?? info.downloadUrl, mimeType: info.mimeType, sha256: info.sha256, fileSize: Number.isFinite(fileSize) ? fileSize : undefined };
  }

  async downloadMedia(mediaId: string): Promise<ArrayBuffer> {
    const info = await this.getMedia(mediaId);
    if (!info.url) throw new WhatsAppApiError("WhatsApp did not return a media URL", 502, "INVALID_RESPONSE", null);
    const response = await this.execute(() => this.client.rawFetch(info.url as string, { signal: AbortSignal.timeout(60_000) }));
    if (!response.ok) throw new WhatsAppApiError("Media download failed", response.status, "MEDIA_DOWNLOAD_FAILED", null);
    return response.arrayBuffer();
  }

  async uploadMedia(input: { appId: string; file: Blob; fileName: string; mimeType: string }): Promise<{ id: string }> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", input.file, input.fileName);
    form.append("type", input.mimeType);
    const response = await this.execute(() => this.client.request<{ id: string }>("POST", `${input.appId}/media`, { body: form, responseType: "json" }));
    if (!response.id) throw new WhatsAppApiError("WhatsApp did not return a media id", 502, "INVALID_RESPONSE", null);
    return { id: response.id };
  }

  async getTemplates(wabaId: string): Promise<WhatsAppTemplate[]> {
    const templates: WhatsAppTemplate[] = [];
    let after: string | undefined;
    while (true) {
      const page = await this.execute(() => this.client.templates.list({ businessAccountId: wabaId, after, limit: 100 }));
      for (const item of page.data ?? []) {
        if (!item.id || !item.name) continue;
        templates.push({ id: item.id, name: item.name, language: item.language ?? "en", category: item.category, status: item.status, components: item.components ?? [], rejectedReason: readString((item as unknown as Record<string, unknown>).rejectedReason) });
      }
      const next = page.paging?.cursors?.after ?? readAfterCursor(page.paging?.next);
      if (!next || next === after) break;
      after = next;
    }
    return templates;
  }

  async createTemplate(wabaId: string, template: WhatsAppTemplateInput & { category: string; components: Array<Record<string, unknown>> }): Promise<{ id: string; status?: string }> {
    const components = template.components.map((component) => ({ ...component, type: String(component.type) }));
    const response = await this.execute(() => this.client.templates.create({ businessAccountId: wabaId, name: template.name, language: template.language, category: template.category, components }));
    if (!response.id) throw new WhatsAppApiError("WhatsApp did not return a template id", 502, "INVALID_RESPONSE", null);
    return { id: response.id, status: response.status };
  }

  async updateTemplate(templateId: string, template: { name?: string; language?: string; components?: Array<Record<string, unknown>> }): Promise<{ success: boolean }> {
    await this.execute(() => this.client.request("POST", templateId, { body: template, responseType: "json" }));
    return { success: true };
  }

  async deleteTemplate(templateId: string): Promise<{ success: boolean }> {
    await this.execute(() => this.client.request("DELETE", templateId, { responseType: "json" }));
    return { success: true };
  }

  async getPhoneNumbers(wabaId: string): Promise<WhatsAppPhoneNumber[]> {
    const response = await this.execute(() => this.client.request<Record<string, unknown>>("GET", `${wabaId}/phone_numbers`, { query: { fields: "id,display_phone_number,verified_name,quality_rating,status" }, responseType: "json" }));
    return readArray(response.data).flatMap((item) => {
      if (!isRecord(item)) return [];
      const id = readString(item.id);
      const displayPhoneNumber = readString(item.displayPhoneNumber);
      if (!id || !displayPhoneNumber) return [];
      return [{ id, displayPhoneNumber, verifiedName: readString(item.verifiedName), qualityRating: readString(item.qualityRating), status: readString(item.status) }];
    });
  }

  async getBusinessProfile(phoneNumberId: string): Promise<WhatsAppBusinessProfile> {
    const response = await this.execute(() => this.client.phoneNumbers.businessProfile.get({ phoneNumberId, fields: "about,address,description,email,vertical,websites" }));
    const profile = response.data[0];
    if (!profile) return {};
    return { about: profile.about, address: profile.address, description: profile.description, email: profile.email, vertical: profile.vertical, website: profile.websites?.[0] ?? readString(profile.website) };
  }
}

export { MetaWhatsAppCloudClient as KapsoWhatsAppClient };
