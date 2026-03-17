import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { hasCredentials } from "@/lib/asc/client";
import { listVersions } from "@/lib/asc/versions";
import { listLocalizations } from "@/lib/asc/localizations";
import { EDITABLE_STATES } from "@/lib/asc/version-types";

export function registerListVersions(server: McpServer): void {
  server.registerTool(
    "list_versions",
    {
      title: "List versions",
      description:
        "List all versions for an app. Returns version IDs, version strings, " +
        "states, platforms, and available locales. Editable versions are marked.",
      inputSchema: z.object({
        appId: z.string().describe("The App Store Connect app ID"),
      }),
    },
    async ({ appId }): Promise<CallToolResult> => {
      if (!hasCredentials()) {
        return {
          isError: true,
          content: [{ type: "text", text: "No App Store Connect credentials configured." }],
        };
      }

      const versions = await listVersions(appId);

      if (versions.length === 0) {
        return {
          content: [{ type: "text", text: `No versions found for app ${appId}.` }],
        };
      }

      const lines: string[] = [];
      for (const v of versions) {
        const editable = EDITABLE_STATES.has(v.attributes.appVersionState);
        let line = `${v.attributes.versionString} (${v.attributes.platform}) – ID: ${v.id}, state: ${v.attributes.appVersionState}`;
        if (editable) line += " [editable]";

        // Fetch locales for editable versions
        if (editable) {
          const locs = await listLocalizations(v.id);
          const locales = locs.map((l) => l.attributes.locale).sort();
          line += `\n  Locales: ${locales.join(", ")}`;
        }

        lines.push(line);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    },
  );
}
