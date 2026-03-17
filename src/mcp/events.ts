import { EventEmitter } from "node:events";

// Shared emitter on globalThis to survive HMR
const g = globalThis as unknown as { __mcpEvents?: EventEmitter };
if (!g.__mcpEvents) {
  g.__mcpEvents = new EventEmitter();
  g.__mcpEvents.setMaxListeners(50);
}

export const mcpEvents = g.__mcpEvents;

export type McpChangeEvent = {
  /** Which area changed: "listing" | "details" | "review" */
  scope: string;
  appId: string;
  versionId?: string;
};

export function emitChange(event: McpChangeEvent): void {
  mcpEvents.emit("change", event);
}
