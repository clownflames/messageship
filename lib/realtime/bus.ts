import type { JsonValue } from "@/db/schema";

export type TenantEvent = {
  organizationId: string;
  type: string;
  payload: JsonValue;
  occurredAt: string;
};

type Subscriber = (event: TenantEvent) => void;

type RealtimeState = {
  subscribers: Map<string, Set<Subscriber>>;
};

const globalState = globalThis as typeof globalThis & { __messageshipRealtime?: RealtimeState };
const state = globalState.__messageshipRealtime ?? { subscribers: new Map<string, Set<Subscriber>>() };
globalState.__messageshipRealtime = state;

export function subscribeToTenant(organizationId: string, subscriber: Subscriber): () => void {
  const subscribers = state.subscribers.get(organizationId) ?? new Set<Subscriber>();
  subscribers.add(subscriber);
  state.subscribers.set(organizationId, subscribers);
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) state.subscribers.delete(organizationId);
  };
}

export function publishTenantEvent(event: Omit<TenantEvent, "occurredAt">): void {
  const subscribers = state.subscribers.get(event.organizationId);
  if (!subscribers) return;
  const completeEvent: TenantEvent = { ...event, occurredAt: new Date().toISOString() };
  for (const subscriber of subscribers) {
    try {
      subscriber(completeEvent);
    } catch {
      state.subscribers.delete(event.organizationId);
    }
  }
}

export function encodeTenantEvent(event: TenantEvent): Uint8Array {
  return new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}
