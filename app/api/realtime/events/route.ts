import { requireWorkspace } from "@/lib/auth/tenant";
import { encodeTenantEvent, subscribeToTenant } from "@/lib/realtime/bus";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const context = await requireWorkspace();
  const encoder = new TextEncoder();
  let cleanup: () => void = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: Uint8Array) => {
        if (!closed) controller.enqueue(chunk);
      };
      const unsubscribe = subscribeToTenant(context.organization.id, (event) => send(encodeTenantEvent(event)));
      const heartbeat = setInterval(() => send(encoder.encode(": heartbeat\n\n")), 25_000);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          return;
        }
      };
      cleanup = close;
      request.signal.addEventListener("abort", close, { once: true });
      send(encoder.encode(`event: ready\ndata: ${JSON.stringify({ organizationId: context.organization.id })}\n\n`));
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
