import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { hasCredentials } from "@/lib/asc/client";
import { listLocalizations } from "@/lib/asc/localizations";
import { listAppInfos, listAppInfoLocalizations } from "@/lib/asc/app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import {
  updateVersionLocalization,
  invalidateLocalizationsCache,
  updateAppInfoLocalization,
} from "@/lib/asc/localization-mutations";
import {
  updateReviewDetail,
  createReviewDetail,
  invalidateVersionsCache,
} from "@/lib/asc/review-mutations";
import { EDITABLE_STATES } from "@/lib/asc/version-types";
import { cacheSet } from "@/lib/cache";
import { resolveApp, resolveVersion, isError, categorizeField, ALL_WRITABLE_FIELDS } from "@/mcp/resolve";
import { emitChange } from "@/mcp/events";

export function registerUpdateApp(server: McpServer): void {
  server.registerTool(
    "update_app",
    {
      title: "Update app data",
      description:
        "Update any field on an app. Accepts the app name and version string (not IDs). " +
        "Store listing fields: whatsNew, description, keywords, promotionalText, supportUrl, marketingUrl. " +
        "App details fields: name, subtitle, privacyPolicyUrl, privacyChoicesUrl. " +
        "Review fields: notes, contactEmail, contactFirstName, contactLastName, contactPhone, " +
        "demoAccountName, demoAccountPassword, demoAccountRequired. " +
        "Locale is required for listing and details fields, not used for review fields.",
      inputSchema: z.object({
        app: z.string().describe("App name (e.g. 'Itsyconnect')"),
        version: z.string().optional().describe("Version string (e.g. '1.7.0'). Omit for the editable version."),
        field: z.string().describe("Field name to update"),
        locale: z.string().optional().describe("Locale code (e.g. 'en-US'). Required for listing/details fields."),
        value: z.string().describe("New field value"),
      }),
    },
    async ({ app, version, field, locale, value }): Promise<CallToolResult> => {
      if (!hasCredentials()) {
        return {
          isError: true,
          content: [{ type: "text", text: "No App Store Connect credentials configured." }],
        };
      }

      const category = categorizeField(field);
      if (!category) {
        return {
          isError: true,
          content: [{ type: "text", text: `Unknown field "${field}". Valid fields: ${ALL_WRITABLE_FIELDS.join(", ")}` }],
        };
      }

      const appResult = await resolveApp(app);
      if (isError(appResult)) {
        return { isError: true, content: [{ type: "text", text: appResult.error }] };
      }

      const versionResult = await resolveVersion(appResult.id, version);
      if (isError(versionResult)) {
        return { isError: true, content: [{ type: "text", text: versionResult.error }] };
      }

      // Review fields – no locale needed
      if (category === "review") {
        try {
          const attrs = field === "demoAccountRequired"
            ? { [field]: value === "true" }
            : { [field]: value };

          if (versionResult.reviewDetail) {
            await updateReviewDetail(versionResult.reviewDetail.id, attrs);
          } else {
            await createReviewDetail(versionResult.id, attrs);
          }
          invalidateVersionsCache(appResult.id);
          emitChange({ scope: "review", appId: appResult.id, versionId: versionResult.id });
          return {
            content: [{ type: "text", text: `Updated ${field} on ${appResult.attributes.name} ${versionResult.attributes.versionString}.` }],
          };
        } catch (err) {
          return {
            isError: true,
            content: [{ type: "text", text: `Failed: ${err instanceof Error ? err.message : String(err)}` }],
          };
        }
      }

      // Listing and details fields require locale
      if (!locale) {
        return {
          isError: true,
          content: [{ type: "text", text: `Locale is required for ${category} field "${field}".` }],
        };
      }

      if (category === "listing") {
        if (field !== "promotionalText" && !EDITABLE_STATES.has(versionResult.attributes.appVersionState)) {
          return {
            isError: true,
            content: [{ type: "text", text: `Version ${versionResult.attributes.versionString} is not editable (${versionResult.attributes.appVersionState}).` }],
          };
        }

        const localizations = await listLocalizations(versionResult.id, true);
        const loc = localizations.find((l) => l.attributes.locale === locale);
        if (!loc) {
          const available = localizations.map((l) => l.attributes.locale).join(", ");
          return {
            isError: true,
            content: [{ type: "text", text: `Locale "${locale}" not found. Available: ${available}` }],
          };
        }

        try {
          await updateVersionLocalization(loc.id, { [field]: value });
          invalidateLocalizationsCache(versionResult.id);
          emitChange({ scope: "listing", appId: appResult.id, versionId: versionResult.id });
          return {
            content: [{ type: "text", text: `Updated ${field} for ${locale} on ${appResult.attributes.name} ${versionResult.attributes.versionString}.` }],
          };
        } catch (err) {
          return {
            isError: true,
            content: [{ type: "text", text: `Failed: ${err instanceof Error ? err.message : String(err)}` }],
          };
        }
      }

      // Details fields
      const appInfos = await listAppInfos(appResult.id);
      const appInfo = pickAppInfo(appInfos);
      if (!appInfo) {
        return {
          isError: true,
          content: [{ type: "text", text: "No editable app info found." }],
        };
      }

      const infoLocs = await listAppInfoLocalizations(appInfo.id, true);
      const loc = infoLocs.find((l) => l.attributes.locale === locale);
      if (!loc) {
        const available = infoLocs.map((l) => l.attributes.locale).join(", ");
        return {
          isError: true,
          content: [{ type: "text", text: `Locale "${locale}" not found in app details. Available: ${available}` }],
        };
      }

      try {
        await updateAppInfoLocalization(loc.id, { [field]: value });
        cacheSet(`appInfoLocalizations:${appInfo.id}`, null, 0);
        emitChange({ scope: "details", appId: appResult.id });
        return {
          content: [{ type: "text", text: `Updated ${field} for ${locale} on ${appResult.attributes.name}.` }],
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
