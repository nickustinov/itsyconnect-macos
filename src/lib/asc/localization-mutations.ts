import { ascFetch, AscApiError } from "./client";
import { cacheInvalidate } from "@/lib/cache";

/** ASC rejects empty strings for URI-typed fields – send null to clear them. */
const URL_FIELDS = new Set([
  "supportUrl",
  "marketingUrl",
  "privacyPolicyUrl",
  "privacyChoicesUrl",
]);

function cleanAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    cleaned[k] = URL_FIELDS.has(k) && v === "" ? null : v;
  }
  return cleaned;
}

// --- Version localizations ---

export async function updateVersionLocalization(
  localizationId: string,
  attributes: Record<string, unknown>,
): Promise<void> {
  await ascFetch(`/v1/appStoreVersionLocalizations/${localizationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "appStoreVersionLocalizations",
        id: localizationId,
        attributes: cleanAttributes(attributes),
      },
    }),
  });
}

export async function createVersionLocalization(
  versionId: string,
  locale: string,
  attributes: Record<string, unknown>,
): Promise<string> {
  // Strip empty strings – ASC rejects them on create
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attributes)) {
    if (v !== "") cleaned[k] = v;
  }
  try {
    const res = await ascFetch<{ data: { id: string } }>("/v1/appStoreVersionLocalizations", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "appStoreVersionLocalizations",
          attributes: { locale, ...cleaned },
          relationships: {
            appStoreVersion: {
              data: { type: "appStoreVersions", id: versionId },
            },
          },
        },
      }),
    });
    return res.data.id;
  } catch (err) {
    // 409 DUPLICATE – resource already exists (e.g. 500→retry→409 or pre-existing).
    // Find it and update instead.
    if (err instanceof AscApiError && err.ascError.statusCode === 409) {
      const { listLocalizations } = await import("./localizations");
      const existing = (await listLocalizations(versionId, true))
        .find((l) => l.attributes.locale === locale);
      if (existing) {
        await updateVersionLocalization(existing.id, attributes);
        return existing.id;
      }
    }
    throw err;
  }
}

export async function deleteVersionLocalization(
  localizationId: string,
): Promise<void> {
  try {
    await ascFetch(`/v1/appStoreVersionLocalizations/${localizationId}`, {
      method: "DELETE",
    });
  } catch (err) {
    // 404 after 500→retry means the first DELETE actually succeeded
    if (err instanceof AscApiError && err.ascError.statusCode === 404) return;
    throw err;
  }
}

export function invalidateLocalizationsCache(versionId: string): void {
  cacheInvalidate(`localizations:${versionId}`);
}

// --- App info localizations ---

export async function updateAppInfoLocalization(
  localizationId: string,
  attributes: Record<string, unknown>,
): Promise<void> {
  await ascFetch(`/v1/appInfoLocalizations/${localizationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "appInfoLocalizations",
        id: localizationId,
        attributes: cleanAttributes(attributes),
      },
    }),
  });
}

export async function createAppInfoLocalization(
  appInfoId: string,
  locale: string,
  attributes: Record<string, unknown>,
): Promise<string> {
  // Strip empty strings – ASC rejects them on create
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attributes)) {
    if (v !== "") cleaned[k] = v;
  }
  try {
    const res = await ascFetch<{ data: { id: string } }>("/v1/appInfoLocalizations", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "appInfoLocalizations",
          attributes: { locale, ...cleaned },
          relationships: {
            appInfo: {
              data: { type: "appInfos", id: appInfoId },
            },
          },
        },
      }),
    });
    return res.data.id;
  } catch (err) {
    // 409 DUPLICATE – resource already exists (e.g. 500→retry→409 or pre-existing).
    // Find it and update instead.
    if (err instanceof AscApiError && err.ascError.statusCode === 409) {
      const { listAppInfoLocalizations } = await import("./app-info");
      const existing = (await listAppInfoLocalizations(appInfoId, true))
        .find((l) => l.attributes.locale === locale);
      if (existing) {
        await updateAppInfoLocalization(existing.id, attributes);
        return existing.id;
      }
    }
    throw err;
  }
}

export async function deleteAppInfoLocalization(
  localizationId: string,
): Promise<void> {
  try {
    await ascFetch(`/v1/appInfoLocalizations/${localizationId}`, {
      method: "DELETE",
    });
  } catch (err) {
    // 404 after 500→retry means the first DELETE actually succeeded
    if (err instanceof AscApiError && err.ascError.statusCode === 404) return;
    throw err;
  }
}

export function invalidateAppInfoLocalizationsCache(appInfoId: string): void {
  cacheInvalidate(`appInfoLocalizations:${appInfoId}`);
}
