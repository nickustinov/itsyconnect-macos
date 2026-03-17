import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { hasCredentials } from "@/lib/asc/client";
import { listVersions } from "@/lib/asc/versions";
import { listLocalizations } from "@/lib/asc/localizations";
import { listAppInfos, listAppInfoLocalizations } from "@/lib/asc/app-info";
import {
  deleteVersionLocalization,
  deleteAppInfoLocalization,
  invalidateLocalizationsCache,
} from "@/lib/asc/localization-mutations";
import { EDITABLE_STATES } from "@/lib/asc/version-types";
import { cacheSet } from "@/lib/cache";
import { emitChange } from "@/mcp/events";

export function registerRemoveLocale(server: McpServer): void {
  server.registerTool(
    "remove_locale",
    {
      title: "Remove locale",
      description:
        "DESTRUCTIVE: Remove a locale from an app version's store listing and app details. " +
        "This permanently deletes all localised content for that locale. " +
        "The primary locale cannot be removed. " +
        "Requires confirm=true to proceed.",
      inputSchema: z.object({
        appId: z.string().describe("The App Store Connect app ID"),
        versionId: z.string().describe("The app store version ID"),
        locale: z.string().describe("Locale code to remove (e.g. 'de-DE')"),
        confirm: z.boolean().describe("Must be true to confirm deletion"),
      }),
    },
    async ({ appId, versionId, locale, confirm }): Promise<CallToolResult> => {
      if (!confirm) {
        return {
          isError: true,
          content: [{ type: "text", text: "Set confirm=true to proceed. This will permanently delete all content for this locale." }],
        };
      }

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

      if (!EDITABLE_STATES.has(version.attributes.appVersionState)) {
        return {
          isError: true,
          content: [{ type: "text", text: `Version ${version.attributes.versionString} is not editable.` }],
        };
      }

      const localizations = await listLocalizations(versionId);
      const loc = localizations.find((l) => l.attributes.locale === locale);
      if (!loc) {
        return {
          isError: true,
          content: [{ type: "text", text: `Locale ${locale} not found on this version.` }],
        };
      }

      // Prevent removing the only/primary locale
      if (localizations.length <= 1) {
        return {
          isError: true,
          content: [{ type: "text", text: "Cannot remove the only locale on this version." }],
        };
      }

      const deleted: string[] = [];
      const errors: string[] = [];

      // Delete version localization (store listing)
      try {
        await deleteVersionLocalization(loc.id);
        invalidateLocalizationsCache(versionId);
        deleted.push("store listing");
      } catch (err) {
        errors.push(`store listing: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Delete app info localization (app details)
      const appInfos = await listAppInfos(appId);
      if (appInfos.length > 0) {
        const appInfo = appInfos[0]!;
        const infoLocs = await listAppInfoLocalizations(appInfo.id, true);
        const infoLoc = infoLocs.find((l) => l.attributes.locale === locale);
        if (infoLoc) {
          try {
            await deleteAppInfoLocalization(infoLoc.id);
            cacheSet(`appInfoLocalizations:${appInfo.id}`, null, 0);
            deleted.push("app details");
          } catch (err) {
            errors.push(`app details: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      emitChange({ scope: "listing", appId, versionId });
      emitChange({ scope: "details", appId });

      const parts: string[] = [];
      if (deleted.length > 0) parts.push(`Removed ${locale} from: ${deleted.join(", ")}`);
      if (errors.length > 0) parts.push(`Errors: ${errors.join("; ")}`);

      return {
        isError: errors.length > 0 && deleted.length === 0,
        content: [{ type: "text", text: parts.join("\n") }],
      };
    },
  );
}
