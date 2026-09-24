export type InboxConversation = {
  id: string;
  accountId: string;
  contactId: string;
  contactName: string;
  phoneNumber: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  starred: boolean;
  archived: boolean;
  freeFormAllowed: boolean;
  policyMessage: string;
};

export type InboxMessage = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  type: string;
  status: "sending" | "sent" | "delivered" | "read" | "failed";
  body: string | null;
  createdAt: string;
  errorMessage: string | null;
};

export type InboxTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
};
