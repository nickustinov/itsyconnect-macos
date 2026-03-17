import { mcpEvents, type McpChangeEvent } from "@/mcp/events";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function onChange(event: McpChangeEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      mcpEvents.on("change", onChange);

      // Send heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          cleanup();
        }
      }, 30_000);

      function cleanup() {
        mcpEvents.off("change", onChange);
        clearInterval(heartbeat);
      }

      // Clean up when client disconnects
      controller.enqueue(encoder.encode(": connected\n\n"));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
