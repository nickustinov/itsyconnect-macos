import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { hasCredentials } from "@/lib/asc/client";
import { listApps } from "@/lib/asc/apps";
import { listLocalizations } from "@/lib/asc/localizations";
import { listAppInfos, listAppInfoLocalizations } from "@/lib/asc/app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import {
  createVersionLocalization,
  deleteVersionLocalization,
  deleteAppInfoLocalization,
  invalidateLocalizationsCache,
  updateAppInfoLocalization,
} from "@/lib/asc/localization-mutations";
import { EDITABLE_STATES } from "@/lib/asc/version-types";
import { cacheSet } from "@/lib/cache";
import { resolveApp, resolveVersion, isError } from "@/mcp/resolve";
import { emitChange } from "@/mcp/events";

export function registerManageLocales(server: McpServer): void {
  server.registerTool(
    "manage_locales",
    {
      title: "Add or remove locales",
      description:
        "Add or remove a locale on an app version. Accepts app name (not ID). " +
        "Action 'add': creates the locale with fields copied from the primary locale. " +
        "Use the translate tool afterwards to localise. " +
        "Action 'remove': DESTRUCTIVE – permanently deletes all content for that locale. " +
        "Requires confirm='true' for remove.",
      inputSchema: z.object({
        app: z.string().describe("App name (e.g. 'Itsyconnect')"),
        version: z.string().optional().describe("Version string (e.g. '1.7.0'). Omit for the editable version."),
        action: z.string().describe("'add' or 'remove'"),
        locale: z.string().describe("Locale code (e.g. 'de-DE', 'fr-FR', 'ja')"),
        confirm: z.string().optional().describe("Must be 'true' to confirm removal"),
      }),
    },
    async ({ app, version, action, locale, confirm }): Promise<CallToolResult> => {
      if (action !== "add" && action !== "remove") {
        return {
          isError: true,
          content: [{ type: "text", text: `Action must be 'add' or 'remove', got '${action}'.` }],
        };
      }

      if (!hasCredentials()) {
        return { isError: true, content: [{ type: "text", text: "No App Store Connect credentials configured." }] };
      }

      const appResult = await resolveApp(app);
      if (isError(appResult)) {
        return { isError: true, content: [{ type: "text", text: appResult.error }] };
      }

      const versionResult = await resolveVersion(appResult.id, version);
      if (isError(versionResult)) {
        return { isError: true, content: [{ type: "text", text: versionResult.error }] };
      }

      if (!EDITABLE_STATES.has(versionResult.attributes.appVersionState)) {
        return {
          isError: true,
          content: [{ type: "text", text: `Version ${versionResult.attributes.versionString} is not editable (${versionResult.attributes.appVersionState}).` }],
        };
      }

      if (action === "add") {
        return addLocale(appResult, versionResult, locale);
      } else {
        if (confirm !== "true") {
          return {
            isError: true,
            content: [{ type: "text", text: `Removing locale "${locale}" will permanently delete all its content. Set confirm='true' to proceed.` }],
          };
        }
        return removeLocale(appResult, versionResult, locale);
      }
    },
  );
}

async function addLocale(
  app: Awaited<ReturnType<typeof listApps>>[number],
  version: Awaited<ReturnType<typeof resolveVersion>> & { id: string },
  locale: string,
): Promise<CallToolResult> {
  const existing = await listLocalizations(version.id);
  if (existing.find((l) => l.attributes.locale === locale)) {
    return { isError: true, content: [{ type: "text", text: `Locale ${locale} already exists.` }] };
  }

  // Copy fields from primary locale
  const primaryLocaleCode = app.attributes.primaryLocale ?? "en-US";
  const primaryLoc = existing.find((l) => l.attributes.locale === primaryLocaleCode) ?? existing[0];

  const attrs: Record<string, unknown> = {};
  if (primaryLoc) {
    const src = primaryLoc.attributes;
    if (src.description) attrs.description = src.description;
    if (src.whatsNew) attrs.whatsNew = src.whatsNew;
    if (src.promotionalText) attrs.promotionalText = src.promotionalText;
    if (src.keywords) attrs.keywords = src.keywords;
    if (src.supportUrl) attrs.supportUrl = src.supportUrl;
    if (src.marketingUrl) attrs.marketingUrl = src.marketingUrl;
  }

  try {
    await createVersionLocalization(version.id, locale, attrs);
    invalidateLocalizationsCache(version.id);

    // Update auto-created app info localization with primary name/subtitle
    const appInfos = await listAppInfos(app.id);
    const appInfo = pickAppInfo(appInfos);
    if (appInfo) {
      const infoLocs = await listAppInfoLocalizations(appInfo.id, true);
      const autoCreated = infoLocs.find((l) => l.attributes.locale === locale);
      const primaryInfo = infoLocs.find((l) => l.attributes.locale === primaryLocaleCode)
        ?? infoLocs.find((l) => l.attributes.locale !== locale);
      if (autoCreated && primaryInfo) {
        const infoAttrs: Record<string, unknown> = {};
        if (primaryInfo.attributes.name) infoAttrs.name = primaryInfo.attributes.name;
        if (primaryInfo.attributes.subtitle) infoAttrs.subtitle = primaryInfo.attributes.subtitle;
        if (Object.keys(infoAttrs).length > 0) {
          await updateAppInfoLocalization(autoCreated.id, infoAttrs);
        }
      }
      cacheSet(`appInfoLocalizations:${appInfo.id}`, null, 0);
    }

    emitChange({ scope: "listing", appId: app.id, versionId: version.id });
    emitChange({ scope: "details", appId: app.id });

    return {
      content: [{ type: "text", text: `Added ${locale} to ${app.attributes.name} ${(version as { attributes: { versionString: string } }).attributes.versionString}. Use the translate tool to localise.` }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `Failed: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }
}

async function removeLocale(
  app: Awaited<ReturnType<typeof listApps>>[number],
  version: Awaited<ReturnType<typeof resolveVersion>> & { id: string },
  locale: string,
): Promise<CallToolResult> {
  const localizations = await listLocalizations(version.id);
  const loc = localizations.find((l) => l.attributes.locale === locale);
  if (!loc) {
    return { isError: true, content: [{ type: "text", text: `Locale ${locale} not found.` }] };
  }
  if (localizations.length <= 1) {
    return { isError: true, content: [{ type: "text", text: "Cannot remove the only locale." }] };
  }

  const deleted: string[] = [];
  const errors: string[] = [];

  try {
    await deleteVersionLocalization(loc.id);
    invalidateLocalizationsCache(version.id);
    deleted.push("store listing");
  } catch (err) {
    errors.push(`store listing: ${err instanceof Error ? err.message : String(err)}`);
  }

  const appInfos = await listAppInfos(app.id);
  const appInfo = pickAppInfo(appInfos);
  if (appInfo) {
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

  emitChange({ scope: "listing", appId: app.id, versionId: version.id });
  emitChange({ scope: "details", appId: app.id });

  const parts: string[] = [];
  if (deleted.length > 0) parts.push(`Removed ${locale} from: ${deleted.join(", ")}`);
  if (errors.length > 0) parts.push(`Errors: ${errors.join("; ")}`);

  return {
    isError: errors.length > 0 && deleted.length === 0,
    content: [{ type: "text", text: parts.join("\n") }],
  };
}
