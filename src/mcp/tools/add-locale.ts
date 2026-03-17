import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { hasCredentials } from "@/lib/asc/client";
import { listVersions } from "@/lib/asc/versions";
import { listLocalizations } from "@/lib/asc/localizations";
import { listAppInfos, listAppInfoLocalizations } from "@/lib/asc/app-info";
import {
  createVersionLocalization,
  invalidateLocalizationsCache,
  updateAppInfoLocalization,
} from "@/lib/asc/localization-mutations";
import { EDITABLE_STATES } from "@/lib/asc/version-types";
import { cacheSet } from "@/lib/cache";
import { emitChange } from "@/mcp/events";

export function registerAddLocale(server: McpServer): void {
  server.registerTool(
    "add_locale",
    {
      title: "Add locale",
      description:
        "Add a new locale to an app version's store listing. " +
        "Apple automatically creates the corresponding app details localization. " +
        "Fields from the primary locale are copied as initial values. " +
        "Use the translate tool afterwards to translate fields.",
      inputSchema: z.object({
        appId: z.string().describe("The App Store Connect app ID"),
        versionId: z.string().describe("The app store version ID"),
        locale: z.string().describe("Locale code to add (e.g. 'de-DE', 'fr-FR', 'ja')"),
      }),
    },
    async ({ appId, versionId, locale }): Promise<CallToolResult> => {
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
          content: [{ type: "text", text: `Version ${version.attributes.versionString} is not editable (state: ${version.attributes.appVersionState}).` }],
        };
      }

      // Check if locale already exists
      const existing = await listLocalizations(versionId);
      if (existing.find((l) => l.attributes.locale === locale)) {
        return {
          isError: true,
          content: [{ type: "text", text: `Locale ${locale} already exists on this version.` }],
        };
      }

      // Get primary locale's fields to copy as initial values
      const primaryLocale = existing.find(
        (l) => l.attributes.locale === (version.attributes as Record<string, unknown>).primaryLocale,
      ) ?? existing[0];

      const attrs: Record<string, unknown> = {};
      if (primaryLocale) {
        const src = primaryLocale.attributes;
        if (src.description) attrs.description = src.description;
        if (src.whatsNew) attrs.whatsNew = src.whatsNew;
        if (src.promotionalText) attrs.promotionalText = src.promotionalText;
        if (src.keywords) attrs.keywords = src.keywords;
        if (src.supportUrl) attrs.supportUrl = src.supportUrl;
        if (src.marketingUrl) attrs.marketingUrl = src.marketingUrl;
      }

      try {
        await createVersionLocalization(versionId, locale, attrs);
        invalidateLocalizationsCache(versionId);

        // Apple auto-creates the app info localization – update it with primary locale's name/subtitle
        const appInfos = await listAppInfos(appId);
        if (appInfos.length > 0) {
          const appInfo = appInfos[0]!;
          const infoLocs = await listAppInfoLocalizations(appInfo.id, true);
          const autoCreated = infoLocs.find((l) => l.attributes.locale === locale);
          if (autoCreated) {
            // Copy name/subtitle from primary locale
            const primaryInfo = infoLocs.find(
              (l) => l.attributes.locale !== locale,
            );
            if (primaryInfo) {
              const infoAttrs: Record<string, unknown> = {};
              if (primaryInfo.attributes.name) infoAttrs.name = primaryInfo.attributes.name;
              if (primaryInfo.attributes.subtitle) infoAttrs.subtitle = primaryInfo.attributes.subtitle;
              if (Object.keys(infoAttrs).length > 0) {
                await updateAppInfoLocalization(autoCreated.id, infoAttrs);
              }
            }
          }
          cacheSet(`appInfoLocalizations:${appInfo.id}`, null, 0);
        }

        emitChange({ scope: "listing", appId, versionId });
        emitChange({ scope: "details", appId });

        return {
          content: [{ type: "text", text: `Added locale ${locale} to ${version.attributes.versionString}. Fields copied from primary locale – use the translate tool to localise.` }],
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
