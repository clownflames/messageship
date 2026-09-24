export type MessageType = "text" | "image" | "video" | "audio" | "document" | "location" | "contact" | "template";

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export type Message = {
  id: string;
  conversationId: string;
  whatsappAccountId: string;
  contactId: string;
  externalId: string | null;
  direction: "inbound" | "outbound";
  type: MessageType;
  status: MessageStatus;
  body: string | null;
  createdAt: string;
  errorMessage: string | null;
};

export type Conversation = {
  id: string;
  whatsappAccountId: string;
  contactId: string;
  contactName: string;
  phoneNumber: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  starred: boolean;
  archived: boolean;
};

export type Contact = {
  id: string;
  name: string;
  phoneNumber: string;
  email: string | null;
  notes: string | null;
  tags: string[];
  lastInteractionAt: string | null;
};

export type Template = {
  id: string;
  whatsappAccountId: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: Array<{ id: string; type: string; content: string; position: number }>;
};

export type Webhook = {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
};

export type SendTextInput = { to: string; text: string; whatsappAccountId?: string };
export type SendMediaInput = { to: string; mediaUrl?: string; mediaId?: string; caption?: string; filename?: string; whatsappAccountId?: string };
export type SendTemplateInput = { to: string; name: string; language: string; components?: Array<Record<string, unknown>>; whatsappAccountId?: string };
export type SendLocationInput = { to: string; latitude: number; longitude: number; name?: string; address?: string; whatsappAccountId?: string };
export type ListOptions = { limit?: number; cursor?: string; search?: string; accountId?: string; conversationId?: string; archived?: boolean };
export type CreateContactInput = { name: string; phoneNumber: string; email?: string; notes?: string; tags?: string[] };
export type CreateWebhookInput = { name: string; url: string; events: string[]; enabled?: boolean };
