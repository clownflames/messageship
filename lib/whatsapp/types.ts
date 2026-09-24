export type WhatsAppMessageType = "text" | "image" | "video" | "audio" | "document" | "location" | "contacts" | "template";

export type WhatsAppMediaInput = {
  id?: string;
  link?: string;
  caption?: string;
  filename?: string;
};

export type WhatsAppLocationInput = {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
};

export type WhatsAppContactInput = Record<string, string>;

export type WhatsAppTemplateInput = {
  name: string;
  language: string;
  components?: Array<Record<string, unknown>>;
};

export type WhatsAppSendResult = {
  messageId: string;
};

export type WhatsAppMediaInfo = {
  id: string;
  messagingProduct?: string;
  url?: string;
  mimeType?: string;
  sha256?: string;
  fileSize?: number;
};

export type WhatsAppTemplate = {
  id: string;
  name: string;
  language: string;
  category?: string;
  status?: string;
  components?: Array<Record<string, unknown>>;
  rejectedReason?: string;
};

export type WhatsAppPhoneNumber = {
  id: string;
  displayPhoneNumber: string;
  verifiedName?: string;
  qualityRating?: string;
  status?: string;
};

export type WhatsAppBusinessProfile = {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  vertical?: string;
  website?: string;
};

export class WhatsAppApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly subcode: string | null;

  constructor(message: string, status: number, code: string | null, subcode: string | null) {
    super(message);
    this.name = "WhatsAppApiError";
    this.status = status;
    this.code = code;
    this.subcode = subcode;
  }
}
