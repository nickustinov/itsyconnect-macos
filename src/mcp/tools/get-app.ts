import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { hasCredentials } from "@/lib/asc/client";
import { listApps } from "@/lib/asc/apps";
import { listVersions } from "@/lib/asc/versions";
import { listLocalizations } from "@/lib/asc/localizations";
import { listAppInfos, listAppInfoLocalizations } from "@/lib/asc/app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import { EDITABLE_STATES } from "@/lib/asc/version-types";
import { resolveApp, resolveVersion, isError } from "@/mcp/resolve";

export function registerGetApp(server: McpServer): void {
  server.registerTool(
    "get_app",
    {
      title: "Get app data",
      description:
        "Get comprehensive app data: versions, locales, and field values. " +
        "Pass an app name (e.g. 'Itsyconnect') and optionally a version string (e.g. '1.7.0'). " +
        "If no version specified, returns the editable version. " +
        "If no app specified, lists all apps. " +
        "Pass a locale to see all field values for that locale.",
      inputSchema: z.object({
        app: z.string().optional().describe("App name (e.g. 'Itsyconnect'). Omit to list all apps."),
        version: z.string().optional().describe("Version string (e.g. '1.7.0'). Omit for the editable version."),
        locale: z.string().optional().describe("Locale code (e.g. 'en-US'). Omit for overview with all locales listed."),
      }),
    },
    async ({ app, version, locale }): Promise<CallToolResult> => {
      if (!hasCredentials()) {
        return {
          isError: true,
          content: [{ type: "text", text: "No App Store Connect credentials configured. Set them up in Itsyconnect first." }],
        };
      }

      // No app specified – list all apps
      if (!app) {
        const apps = await listApps();
        const lines = apps.map(
          (a) => `${a.attributes.name} (${a.attributes.primaryLocale})`,
        );
        return {
          content: [{ type: "text", text: `Apps:\n${lines.join("\n")}` }],
        };
      }

      const appResult = await resolveApp(app);
      if (isError(appResult)) {
        return { isError: true, content: [{ type: "text", text: appResult.error }] };
      }

      const versions = await listVersions(appResult.id);

      // No version specified and no locale – show overview
      if (!version && !locale) {
        const lines = [`${appResult.attributes.name} (${appResult.attributes.primaryLocale})`, ""];

        for (const v of versions) {
          const editable = EDITABLE_STATES.has(v.attributes.appVersionState);
          let line = `${v.attributes.versionString} (${v.attributes.platform}) – ${v.attributes.appVersionState}`;
          if (editable) {
            const locs = await listLocalizations(v.id);
            const locales = locs.map((l) => l.attributes.locale).sort();
            line += `\n  Locales: ${locales.join(", ")}`;
          }
          lines.push(line);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      // Resolve version
      const versionResult = await resolveVersion(appResult.id, version);
      if (isError(versionResult)) {
        return { isError: true, content: [{ type: "text", text: versionResult.error }] };
      }

      const localizations = await listLocalizations(versionResult.id, true);

      // No locale – show version overview with all locales
      if (!locale) {
        const locales = localizations.map((l) => l.attributes.locale).sort();
        const lines = [
          `${appResult.attributes.name} ${versionResult.attributes.versionString} (${versionResult.attributes.appVersionState})`,
          `Locales: ${locales.join(", ")}`,
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      // Full field dump for a specific locale
      const loc = localizations.find((l) => l.attributes.locale === locale);
      if (!loc) {
        const available = localizations.map((l) => l.attributes.locale).join(", ");
        return {
          isError: true,
          content: [{ type: "text", text: `Locale "${locale}" not found on version ${versionResult.attributes.versionString}. Available: ${available}` }],
        };
      }

      const lines = [
        `${appResult.attributes.name} ${versionResult.attributes.versionString} – ${locale}`,
        "",
        "## Store listing",
        `What's new: ${loc.attributes.whatsNew || "(empty)"}`,
        `Description: ${loc.attributes.description || "(empty)"}`,
        `Keywords: ${loc.attributes.keywords || "(empty)"}`,
        `Promotional text: ${loc.attributes.promotionalText || "(empty)"}`,
        `Support URL: ${loc.attributes.supportUrl || "(empty)"}`,
        `Marketing URL: ${loc.attributes.marketingUrl || "(empty)"}`,
      ];

      // App details for same locale
      const appInfos = await listAppInfos(appResult.id);
      const appInfo = pickAppInfo(appInfos);
      if (appInfo) {
        const infoLocs = await listAppInfoLocalizations(appInfo.id, true);
        const infoLoc = infoLocs.find((l) => l.attributes.locale === locale);
        if (infoLoc) {
          lines.push(
            "",
            "## App details",
            `Name: ${infoLoc.attributes.name || "(empty)"}`,
            `Subtitle: ${infoLoc.attributes.subtitle || "(empty)"}`,
            `Privacy policy URL: ${infoLoc.attributes.privacyPolicyUrl || "(empty)"}`,
            `Privacy choices URL: ${infoLoc.attributes.privacyChoicesUrl || "(empty)"}`,
          );
        }
      }

      // Review info
      if (versionResult.reviewDetail) {
        const r = versionResult.reviewDetail.attributes;
        lines.push(
          "",
          "## App review",
          `Notes: ${r.notes || "(empty)"}`,
          `Contact: ${r.contactFirstName || ""} ${r.contactLastName || ""} ${r.contactEmail || ""} ${r.contactPhone || ""}`.trim(),
          `Demo account: ${r.demoAccountRequired ? `${r.demoAccountName || "(no username)"}` : "not required"}`,
        );
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
