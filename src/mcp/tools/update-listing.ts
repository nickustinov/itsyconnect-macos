import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { hasCredentials } from "@/lib/asc/client";
import { listVersions } from "@/lib/asc/versions";
import { listLocalizations } from "@/lib/asc/localizations";
import { updateVersionLocalization } from "@/lib/asc/localization-mutations";
import { EDITABLE_STATES } from "@/lib/asc/version-types";
import { cacheSet } from "@/lib/cache";
import { emitChange } from "@/mcp/events";

const LISTING_FIELDS = z.enum([
  "whatsNew",
  "description",
  "keywords",
  "promotionalText",
  "supportUrl",
  "marketingUrl",
]);

export function registerUpdateListing(server: McpServer): void {
  server.registerTool(
    "update_listing",
    {
      title: "Update store listing",
      description:
        "Update a store listing field for a single locale on an app version. " +
        "Supported fields: whatsNew, description, keywords, promotionalText, supportUrl, marketingUrl. " +
        "Call multiple times for multiple locales.",
      inputSchema: z.object({
        appId: z.string().describe("The App Store Connect app ID"),
        versionId: z.string().describe("The app store version ID to update"),
        field: LISTING_FIELDS.describe("The field to update"),
        locale: z.string().describe("Locale code (e.g. 'en-US')"),
        value: z.string().describe("The new field value"),
      }),
    },
    async ({ appId, versionId, field, locale, value }): Promise<CallToolResult> => {
      if (!hasCredentials()) {
        return {
          isError: true,
          content: [{ type: "text", text: "No App Store Connect credentials configured." }],
        };
      }

      const versions = await listVersions(appId);
      const version = versions.find((v) => v.id === versionId);
      if (!version) {
        return {
          isError: true,
          content: [{ type: "text", text: `Version ${versionId} not found.` }],
        };
      }

      if (field !== "promotionalText" && !EDITABLE_STATES.has(version.attributes.appVersionState)) {
        return {
          isError: true,
          content: [{ type: "text", text: `Version ${version.attributes.versionString} is in state "${version.attributes.appVersionState}" and cannot be edited.` }],
        };
      }

      const localizations = await listLocalizations(versionId);
      const loc = localizations.find((l) => l.attributes.locale === locale);
      if (!loc) {
        const available = localizations.map((l) => l.attributes.locale).join(", ");
        return {
          isError: true,
          content: [{ type: "text", text: `Locale ${locale} not found. Available: ${available}` }],
        };
      }

      try {
        await updateVersionLocalization(loc.id, { [field]: value });
        cacheSet(`localizations:${versionId}`, null, 0);
        emitChange({ scope: "listing", appId, versionId });
        return {
          content: [{ type: "text", text: `Updated ${field} for ${locale} on ${version.attributes.versionString}.` }],
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
