import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { hasCredentials } from "@/lib/asc/client";
import { listApps } from "@/lib/asc/apps";

export function registerListApps(server: McpServer): void {
  server.registerTool(
    "list_apps",
    {
      title: "List apps",
      description:
        "List all apps in the connected App Store Connect account. " +
        "Returns app IDs, names, bundle IDs, and primary locales.",
    },
    async (): Promise<CallToolResult> => {
      if (!hasCredentials()) {
        return {
          isError: true,
          content: [{ type: "text", text: "No App Store Connect credentials configured." }],
        };
      }

      const apps = await listApps();

      const lines = apps.map(
        (a) => `${a.attributes.name} – ID: ${a.id}, bundle: ${a.attributes.bundleId}, locale: ${a.attributes.primaryLocale}`,
      );

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    },
  );
}
