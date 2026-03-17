import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { hasCredentials } from "@/lib/asc/client";
import { listAppInfos, listAppInfoLocalizations } from "@/lib/asc/app-info";
import { updateAppInfoLocalization } from "@/lib/asc/localization-mutations";
import { cacheSet } from "@/lib/cache";

const DETAIL_FIELDS = z.enum([
  "name",
  "subtitle",
  "privacyPolicyUrl",
  "privacyChoicesUrl",
]);

export function registerUpdateAppDetails(server: McpServer): void {
  server.registerTool(
    "update_app_details",
    {
      title: "Update app details",
      description:
        "Update an app details field for a single locale. " +
        "Supported fields: name, subtitle, privacyPolicyUrl, privacyChoicesUrl. " +
        "Call multiple times for multiple locales.",
      inputSchema: z.object({
        appId: z.string().describe("The App Store Connect app ID"),
        field: DETAIL_FIELDS.describe("The field to update"),
        locale: z.string().describe("Locale code (e.g. 'en-US')"),
        value: z.string().describe("The new field value"),
      }),
    },
    async ({ appId, field, locale, value }): Promise<CallToolResult> => {
      if (!hasCredentials()) {
        return {
          isError: true,
          content: [{ type: "text", text: "No App Store Connect credentials configured." }],
        };
      }

      const appInfos = await listAppInfos(appId);
      if (appInfos.length === 0) {
        return {
          isError: true,
          content: [{ type: "text", text: `No app info found for app ${appId}.` }],
        };
      }

      const appInfo = appInfos[0]!;
      const localizations = await listAppInfoLocalizations(appInfo.id);
      const loc = localizations.find((l) => l.attributes.locale === locale);
      if (!loc) {
        const available = localizations.map((l) => l.attributes.locale).join(", ");
        return {
          isError: true,
          content: [{ type: "text", text: `Locale ${locale} not found. Available: ${available}` }],
        };
      }

      try {
        await updateAppInfoLocalization(loc.id, { [field]: value });
        cacheSet(`appInfoLocalizations:${appInfo.id}`, null, 0);
        return {
          content: [{ type: "text", text: `Updated ${field} for ${locale}.` }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    },
  );
}
