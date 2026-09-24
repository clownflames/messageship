export const CUSTOMER_SERVICE_WINDOW_HOURS = 24;

export type ConversationWindow = {
  isOpen: boolean;
  openedAt: Date | null;
  closesAt: Date | null;
  reason: "open" | "closed" | "no_inbound_message";
};

export type MessagePolicy = ConversationWindow & {
  canSendFreeForm: boolean;
  requiresTemplate: boolean;
  reasonMessage: string;
};

export function evaluateConversationWindow(lastInboundAt: Date | null, now = new Date()): ConversationWindow {
  if (!lastInboundAt) {
    return { isOpen: false, openedAt: null, closesAt: null, reason: "no_inbound_message" };
  }
  const closesAt = new Date(lastInboundAt.getTime() + CUSTOMER_SERVICE_WINDOW_HOURS * 60 * 60 * 1000);
  if (closesAt.getTime() <= now.getTime()) {
    return { isOpen: false, openedAt: lastInboundAt, closesAt, reason: "closed" };
  }
  return { isOpen: true, openedAt: lastInboundAt, closesAt, reason: "open" };
}

export function getOutboundMessagePolicy(input: { type: string; lastInboundAt: Date | null; now?: Date }): MessagePolicy {
  const window = evaluateConversationWindow(input.lastInboundAt, input.now);
  const isTemplate = input.type === "template";
  const canSendFreeForm = window.isOpen && !isTemplate;
  return {
    ...window,
    canSendFreeForm,
    requiresTemplate: !canSendFreeForm,
    reasonMessage: window.isOpen ? "Free-form messaging is allowed while the customer-service window is open." : "Free-form messaging is unavailable because the customer-service window is closed. Use an approved template message.",
  };
}
