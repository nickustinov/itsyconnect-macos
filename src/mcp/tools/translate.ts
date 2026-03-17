import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { hasCredentials } from "@/lib/asc/client";
import { listLocalizations } from "@/lib/asc/localizations";
import { listAppInfos, listAppInfoLocalizations } from "@/lib/asc/app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import { updateVersionLocalization } from "@/lib/asc/localization-mutations";
import { updateAppInfoLocalization } from "@/lib/asc/localization-mutations";
import { EDITABLE_STATES } from "@/lib/asc/version-types";
import { buildForbiddenKeywords } from "@/lib/asc/keyword-utils";
import { FIELD_LIMITS } from "@/lib/asc/locale-names";
import { cacheSet } from "@/lib/cache";
import { resolveApp, resolveVersion, isError, ALL_TRANSLATABLE_FIELDS } from "@/mcp/resolve";
import { emitChange } from "@/mcp/events";

const LISTING_FIELDS = new Set(["whatsNew", "description", "keywords", "promotionalText"]);
const DETAIL_FIELDS = new Set(["name", "subtitle"]);

async function aiRequest(body: Record<string, unknown>): Promise<string> {
  const res = await fetch("http://127.0.0.1:" + (process.env.PORT ?? "3000") + "/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `AI request failed (${res.status})`);
  }
  return ((await res.json()) as { result: string }).result;
}

async function translateText(text: string, fromLocale: string, toLocale: string, field: string, appName: string): Promise<string> {
  return aiRequest({ action: "translate", text, field, fromLocale, toLocale, appName, charLimit: FIELD_LIMITS[field] });
}

async function fixKeywords(text: string, locale: string, appName: string, description: string | undefined, forbidden: string[]): Promise<string> {
  return aiRequest({ action: "fix-keywords", text, field: "keywords", locale, appName, description, charLimit: 100, forbiddenWords: forbidden });
}

export function registerTranslate(server: McpServer): void {
  server.registerTool(
    "translate",
    {
      title: "Translate app fields",
      description:
        "Translate store listing or app details fields from a source locale to target locales " +
        "using the configured AI provider. Accepts app name (not ID). " +
        "Translatable fields: whatsNew, description, keywords, promotionalText, name, subtitle. " +
        "If targetLocales is omitted, translates to all existing locales.",
      inputSchema: z.object({
        app: z.string().describe("App name (e.g. 'Itsyconnect')"),
        version: z.string().optional().describe("Version string (e.g. '1.7.0'). Omit for the editable version."),
        fields: z.string().describe("Comma-separated fields (e.g. 'whatsNew,description,name,subtitle')"),
        sourceLocale: z.string().describe("Source locale code (e.g. 'en-US')"),
        targetLocales: z.string().optional().describe("Comma-separated target locales. Omit to translate to all."),
      }),
    },
    async ({ app, version, fields: fieldsStr, sourceLocale, targetLocales: targetStr }): Promise<CallToolResult> => {
      const fields = fieldsStr.split(",").map((f) => f.trim()).filter(Boolean);
      const targetLocales = targetStr ? targetStr.split(",").map((l) => l.trim()).filter(Boolean) : undefined;

      const invalidFields = fields.filter((f) => !ALL_TRANSLATABLE_FIELDS.includes(f));
      if (invalidFields.length > 0) {
        return {
          isError: true,
          content: [{ type: "text", text: `Invalid fields: ${invalidFields.join(", ")}. Valid: ${ALL_TRANSLATABLE_FIELDS.join(", ")}` }],
        };
      }

      if (!hasCredentials()) {
        return { isError: true, content: [{ type: "text", text: "No App Store Connect credentials configured." }] };
      }

      const appResult = await resolveApp(app);
      if (isError(appResult)) {
        return { isError: true, content: [{ type: "text", text: appResult.error }] };
      }
      const appName = appResult.attributes.name;

      const listingFields = fields.filter((f) => LISTING_FIELDS.has(f));
      const detailFields = fields.filter((f) => DETAIL_FIELDS.has(f));

      const results: string[] = [];
      const errors: string[] = [];

      // Translate store listing fields
      if (listingFields.length > 0) {
        const versionResult = await resolveVersion(appResult.id, version);
        if (isError(versionResult)) {
          errors.push(versionResult.error);
        } else if (!EDITABLE_STATES.has(versionResult.attributes.appVersionState)) {
          errors.push(`Version ${versionResult.attributes.versionString} is not editable.`);
        } else {
          const localizations = await listLocalizations(versionResult.id, true);
          const localeMap = new Map(localizations.map((l) => [l.attributes.locale, l]));

          const sourceLoc = localeMap.get(sourceLocale);
          if (!sourceLoc) {
            errors.push(`Source locale ${sourceLocale} not found on version.`);
          } else {
            const targets = targetLocales
              ? targetLocales.filter((l) => l !== sourceLocale && localeMap.has(l))
              : [...localeMap.keys()].filter((l) => l !== sourceLocale);

            const otherKeywords: Record<string, string> = {};
            for (const [loc, data] of localeMap) {
              if (data.attributes.keywords) otherKeywords[loc] = data.attributes.keywords;
            }

            for (const field of listingFields) {
              const sourceText = (sourceLoc.attributes as Record<string, string | null>)[field];
              if (!sourceText) {
                results.push(`${field}: skipped (empty in ${sourceLocale})`);
                continue;
              }

              for (const locale of targets) {
                try {
                  let finalValue = await translateText(sourceText, sourceLocale, locale, field, appName);

                  if (field === "keywords") {
                    const forbidden = buildForbiddenKeywords({
                      appName,
                      subtitle: sourceLoc.attributes.promotionalText || undefined,
                      otherLocaleKeywords: otherKeywords,
                    });
                    const forbiddenSet = new Set(forbidden.map((w) => w.toLowerCase()));
                    const stripped = finalValue
                      .split(",")
                      .map((w) => w.trim())
                      .filter((w) => w && !forbiddenSet.has(w.toLowerCase()))
                      .join(",");
                    finalValue = await fixKeywords(stripped, locale, appName, sourceLoc.attributes.description || undefined, forbidden);
                  }

                  const loc = localeMap.get(locale)!;
                  await updateVersionLocalization(loc.id, { [field]: finalValue });
                  results.push(`${field} → ${locale}: done`);
                } catch (err) {
                  errors.push(`${field} → ${locale}: ${err instanceof Error ? err.message : String(err)}`);
                }
              }
            }

            cacheSet(`localizations:${versionResult.id}`, null, 0);
            emitChange({ scope: "listing", appId: appResult.id, versionId: versionResult.id });
          }
        }
      }

      // Translate app details fields
      if (detailFields.length > 0) {
        const appInfos = await listAppInfos(appResult.id);
        const appInfo = pickAppInfo(appInfos);
        if (!appInfo) {
          errors.push("No editable app info found.");
        } else {
          const localizations = await listAppInfoLocalizations(appInfo.id, true);
          const localeMap = new Map(localizations.map((l) => [l.attributes.locale, l]));

          const sourceLoc = localeMap.get(sourceLocale);
          if (!sourceLoc) {
            errors.push(`Source locale ${sourceLocale} not found in app details.`);
          } else {
            const targets = targetLocales
              ? targetLocales.filter((l) => l !== sourceLocale && localeMap.has(l))
              : [...localeMap.keys()].filter((l) => l !== sourceLocale);

            for (const field of detailFields) {
              const sourceText = (sourceLoc.attributes as Record<string, string | null>)[field];
              if (!sourceText) {
                results.push(`${field}: skipped (empty in ${sourceLocale})`);
                continue;
              }

              for (const locale of targets) {
                try {
                  const translated = await translateText(sourceText, sourceLocale, locale, field, appName);
                  const loc = localeMap.get(locale)!;
                  await updateAppInfoLocalization(loc.id, { [field]: translated });
                  results.push(`${field} → ${locale}: done`);
                } catch (err) {
                  errors.push(`${field} → ${locale}: ${err instanceof Error ? err.message : String(err)}`);
                }
              }
            }

            cacheSet(`appInfoLocalizations:${appInfo.id}`, null, 0);
            emitChange({ scope: "details", appId: appResult.id });
          }
        }
      }

      const parts = [...results, ...errors];
      return {
        isError: errors.length > 0 && results.length === 0,
        content: [{ type: "text", text: parts.join("\n") || "Nothing to translate." }],
      };
    },
  );
}
