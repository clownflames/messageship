import { WhatsappApiError, WhatsappValidationError } from "./errors";
import type { Contact, Conversation, CreateContactInput, CreateWebhookInput, ListOptions, Message, SendLocationInput, SendMediaInput, SendTemplateInput, SendTextInput, Template, Webhook } from "./types";

export type WhatsappOptions = { baseUrl?: string; defaultWhatsappAccountId?: string; fetch?: typeof fetch };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function required(value: string | undefined, field: string): string {
  if (!value || !value.trim()) throw new WhatsappValidationError(field, `${field} is required`);
  return value;
}

class HttpClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(apiKey: string, options: WhatsappOptions) {
    this.apiKey = required(apiKey, "apiKey");
    this.baseUrl = (options.baseUrl ?? "/api/v1").replace(/\/$/, "");
    this.fetchImplementation = options.fetch ?? fetch;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const url = this.baseUrl.startsWith("http") ? new URL(path.replace(/^\//, ""), `${this.baseUrl}/`).toString() : `${this.baseUrl}${path}`;
    const response = await this.fetchImplementation(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = isRecord(payload) && isRecord(payload.error) ? payload.error : undefined;
      throw new WhatsappApiError(typeof error?.message === "string" ? error.message : `MessageShip API returned ${response.status}`, response.status, typeof error?.code === "string" ? error.code : "API_ERROR", response.headers.get("x-request-id") ?? undefined);
    }
    if (!isRecord(payload) || payload.success !== true || !("data" in payload)) throw new WhatsappApiError("MessageShip API returned an invalid response", response.status, "INVALID_RESPONSE");
    return payload.data as T;
  }
}

class MessagesResource {
  constructor(private readonly http: HttpClient, private readonly defaultAccountId?: string) {}

  async sendText(input: SendTextInput): Promise<Message> {
    const accountId = this.account(input.whatsappAccountId);
    return this.http.request<Message>("POST", "/messages/send", { whatsappAccountId: accountId, to: required(input.to, "to"), type: "text", text: { body: required(input.text, "text") } });
  }

  async sendImage(input: SendMediaInput): Promise<Message> { return this.sendMedia(input, "image"); }
  async sendVideo(input: SendMediaInput): Promise<Message> { return this.sendMedia(input, "video"); }
  async sendAudio(input: SendMediaInput): Promise<Message> { return this.sendMedia(input, "audio"); }
  async sendDocument(input: SendMediaInput): Promise<Message> { return this.sendMedia(input, "document"); }

  async sendLocation(input: SendLocationInput): Promise<Message> {
    return this.http.request<Message>("POST", "/messages/send", { whatsappAccountId: this.account(input.whatsappAccountId), to: required(input.to, "to"), type: "location", location: { latitude: input.latitude, longitude: input.longitude, name: input.name, address: input.address } });
  }

  async sendTemplate(input: SendTemplateInput): Promise<Message> {
    return this.http.request<Message>("POST", "/messages/send", { whatsappAccountId: this.account(input.whatsappAccountId), to: required(input.to, "to"), type: "template", template: { name: required(input.name, "name"), language: required(input.language, "language"), components: input.components ?? [] } });
  }

  async list(options: ListOptions = {}): Promise<Message[]> {
    const query = new URLSearchParams();
    if (options.limit !== undefined) query.set("limit", String(options.limit));
    if (options.conversationId !== undefined) query.set("conversationId", options.conversationId);
    if (options.search !== undefined) query.set("search", options.search);
    return (await this.http.request<{ messages: Message[] }>("GET", `/messages${query.size ? `?${query.toString()}` : ""}`)).messages;
  }

  private account(accountId?: string): string | undefined { return accountId ?? this.defaultAccountId; }
  private async sendMedia(input: SendMediaInput, type: "image" | "video" | "audio" | "document"): Promise<Message> {
    const media: Record<string, string> = {};
    if (input.mediaId) media.id = input.mediaId;
    if (input.mediaUrl) media.link = input.mediaUrl;
    if (input.caption) media.caption = input.caption;
    if (input.filename) media.filename = input.filename;
    if (!media.id && !media.link) throw new WhatsappValidationError("media", "mediaId or mediaUrl is required");
    return this.http.request<Message>("POST", "/messages/send", { whatsappAccountId: this.account(input.whatsappAccountId), to: required(input.to, "to"), type, [type]: media });
  }
}

class ConversationsResource {
  constructor(private readonly http: HttpClient) {}
  async list(options: ListOptions = {}): Promise<Conversation[]> {
    const query = new URLSearchParams();
    if (options.accountId) query.set("accountId", options.accountId);
    if (options.search) query.set("search", options.search);
    if (options.archived !== undefined) query.set("archived", String(options.archived));
    return (await this.http.request<{ conversations: Conversation[] }>("GET", `/conversations${query.size ? `?${query.toString()}` : ""}`)).conversations;
  }
  async get(id: string): Promise<Message[]> { return (await this.http.request<{ messages: Message[] }>("GET", `/conversations/${encodeURIComponent(required(id, "id"))}`)).messages; }
}

class ContactsResource {
  constructor(private readonly http: HttpClient) {}
  async list(options: ListOptions = {}): Promise<Contact[]> {
    const query = new URLSearchParams();
    if (options.limit !== undefined) query.set("limit", String(options.limit));
    if (options.search !== undefined) query.set("search", options.search);
    return (await this.http.request<{ contacts: Contact[] }>("GET", `/contacts${query.size ? `?${query.toString()}` : ""}`)).contacts;
  }
  async get(id: string): Promise<Contact> { return (await this.http.request<{ contact: Contact }>("GET", `/contacts/${encodeURIComponent(required(id, "id"))}`)).contact; }
  async create(input: CreateContactInput): Promise<Contact> { return (await this.http.request<{ contact: Contact }>("POST", "/contacts", { name: required(input.name, "name"), phoneNumber: required(input.phoneNumber, "phoneNumber"), email: input.email, notes: input.notes, tags: input.tags ?? [] })).contact; }
}

class TemplatesResource {
  constructor(private readonly http: HttpClient) {}
  async list(options: Pick<ListOptions, "accountId"> = {}): Promise<Template[]> {
    const query = options.accountId ? `?accountId=${encodeURIComponent(options.accountId)}` : "";
    return (await this.http.request<{ templates: Template[] }>("GET", `/templates${query}`)).templates;
  }
  async create(input: { whatsappAccountId: string; name: string; language: string; category: string; components: Array<Record<string, unknown>> }): Promise<Template> { return (await this.http.request<{ template: Template }>("POST", "/templates", input)).template; }
}

class WebhooksResource {
  constructor(private readonly http: HttpClient) {}
  async list(): Promise<Webhook[]> { return (await this.http.request<{ webhooks: Webhook[] }>("GET", "/webhooks")).webhooks; }
  async create(input: CreateWebhookInput): Promise<Webhook & { secret: string }> { return this.http.request<Webhook & { secret: string }>("POST", "/webhooks", { name: required(input.name, "name"), url: required(input.url, "url"), events: input.events, enabled: input.enabled ?? true }); }
}

export class Whatsapp {
  readonly messages: MessagesResource;
  readonly conversations: ConversationsResource;
  readonly contacts: ContactsResource;
  readonly templates: TemplatesResource;
  readonly webhooks: WebhooksResource;
  private readonly http: HttpClient;

  constructor(apiKey: string, options: WhatsappOptions = {}) {
    this.http = new HttpClient(apiKey, options);
    this.messages = new MessagesResource(this.http, options.defaultWhatsappAccountId);
    this.conversations = new ConversationsResource(this.http);
    this.contacts = new ContactsResource(this.http);
    this.templates = new TemplatesResource(this.http);
    this.webhooks = new WebhooksResource(this.http);
  }
}
