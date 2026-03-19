"use client";

import { useEffect } from "react";

export type McpChangeEvent = {
  scope: string;
  appId: string;
  versionId?: string;
};

/**
 * Subscribe to MCP change events via SSE.
 * Calls `onEvent` whenever an MCP tool mutates data.
 */
export function useMcpEvents(onEvent: (event: McpChangeEvent) => void): void {
  useEffect(() => {
    const es = new EventSource("/api/mcp/events");

    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as McpChangeEvent;
        onEvent(event);
      } catch {
        // ignore parse errors (heartbeats, etc.)
      }
    };

    return () => es.close();
  }, [onEvent]);
}
