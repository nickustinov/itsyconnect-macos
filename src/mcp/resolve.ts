import { listApps } from "@/lib/asc/apps";
import { listVersions } from "@/lib/asc/versions";
import { listLocalizations } from "@/lib/asc/localizations";
import { listAppInfos, listAppInfoLocalizations } from "@/lib/asc/app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import { EDITABLE_STATES } from "@/lib/asc/version-types";
import type { AscApp } from "@/lib/asc/apps";
import type { AscVersion } from "@/lib/asc/version-types";

export type ResolveError = { error: string };

export async function resolveApp(
  appName: string,
): Promise<AscApp | ResolveError> {
  const apps = await listApps();

  // Try exact match first, then case-insensitive, then partial
  const exact = apps.find((a) => a.attributes.name === appName);
  if (exact) return exact;

  const lower = appName.toLowerCase();
  const ci = apps.find((a) => a.attributes.name.toLowerCase() === lower);
  if (ci) return ci;

  const partial = apps.find((a) => a.attributes.name.toLowerCase().includes(lower));
  if (partial) return partial;

  return {
    error: `App "${appName}" not found. Available: ${apps.map((a) => a.attributes.name).join(", ")}`,
  };
}

export async function resolveVersion(
  appId: string,
  versionStr?: string,
): Promise<AscVersion | ResolveError> {
  const versions = await listVersions(appId);

  if (versionStr) {
    const match = versions.find((v) => v.attributes.versionString === versionStr);
    if (match) return match;
    return {
      error: `Version "${versionStr}" not found. Available: ${versions.map((v) => `${v.attributes.versionString} (${v.attributes.appVersionState})`).join(", ")}`,
    };
  }

  // Default to the editable version
  const editable = versions.find((v) => EDITABLE_STATES.has(v.attributes.appVersionState));
  if (editable) return editable;

  return {
    error: `No editable version found. Available: ${versions.map((v) => `${v.attributes.versionString} (${v.attributes.appVersionState})`).join(", ")}`,
  };
}

export function isError(result: unknown): result is ResolveError {
  return typeof result === "object" && result !== null && "error" in result;
}

/** Listing fields route to version localizations, detail fields route to app info localizations. */
const LISTING_FIELD_SET = new Set([
  "whatsNew", "description", "keywords", "promotionalText", "supportUrl", "marketingUrl",
]);
const DETAIL_FIELD_SET = new Set([
  "name", "subtitle", "privacyPolicyUrl", "privacyChoicesUrl",
]);
const REVIEW_FIELD_SET = new Set([
  "notes", "contactEmail", "contactFirstName", "contactLastName",
  "contactPhone", "demoAccountName", "demoAccountPassword", "demoAccountRequired",
]);

export type FieldCategory = "listing" | "details" | "review";

export function categorizeField(field: string): FieldCategory | null {
  if (LISTING_FIELD_SET.has(field)) return "listing";
  if (DETAIL_FIELD_SET.has(field)) return "details";
  if (REVIEW_FIELD_SET.has(field)) return "review";
  return null;
}

export const ALL_WRITABLE_FIELDS = [
  ...LISTING_FIELD_SET, ...DETAIL_FIELD_SET, ...REVIEW_FIELD_SET,
];

export const ALL_TRANSLATABLE_FIELDS = [
  "whatsNew", "description", "keywords", "promotionalText", "name", "subtitle",
];

export async function getLocalizationData(appId: string, versionId: string) {
  const [localizations, appInfos] = await Promise.all([
    listLocalizations(versionId, true),
    listAppInfos(appId),
  ]);

  const appInfo = pickAppInfo(appInfos);
  const infoLocalizations = appInfo
    ? await listAppInfoLocalizations(appInfo.id, true)
    : [];

  return { localizations, appInfo, infoLocalizations };
}
