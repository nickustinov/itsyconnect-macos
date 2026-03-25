import { ascFetch } from "../client";
import { buildIconUrl } from "../apps";
import { cacheInvalidatePrefix } from "@/lib/cache";
import { withCache, normalizeArray } from "../helpers";
import { listGroups } from "./groups";
import {
  BUILDS_TTL,
  deriveBuildStatus,
  type TFBuild,
  type AscJsonApiResponse,
} from "./types";

// ── Builds ───────────────────────────────────────────────────────

export async function listBuilds(
  appId: string,
  forceRefresh = false,
  filters?: { platform?: string; versionString?: string; lite?: boolean },
): Promise<TFBuild[]> {
  const platform = filters?.platform;
  const versionString = filters?.versionString;
  const lite = filters?.lite ?? false;
  const cacheKey = platform && versionString
    ? `tf-builds:${appId}:${platform}:${versionString}`
    : `tf-builds:${appId}`;

  return withCache(cacheKey, BUILDS_TTL, forceRefresh, async () => {
  const params = new URLSearchParams({
    "filter[app]": appId,
    sort: "-uploadedDate",
    limit: "200",
    include: "preReleaseVersion,buildBetaDetail,betaBuildLocalizations",
    "fields[preReleaseVersions]": "version,platform",
    "fields[buildBetaDetails]": "internalBuildState,externalBuildState",
    "fields[betaBuildLocalizations]": "whatsNew,locale",
  });

  if (platform) {
    params.set("filter[preReleaseVersion.platform]", platform);
  }
  if (versionString) {
    params.set("filter[preReleaseVersion.version]", versionString);
  }

  const response = await ascFetch<AscJsonApiResponse>(
    `/v1/builds?${params}`,
  );

  const dataArr = normalizeArray(response.data);

  // Build included lookup maps
  const includedMap = new Map<string, { id: string; type: string; attributes: Record<string, unknown> }>();
  if (response.included) {
    for (const inc of response.included) {
      includedMap.set(`${inc.type}:${inc.id}`, inc);
    }
  }

  // In lite mode, skip expensive group and metrics lookups (used by store listing picker)
  const buildToGroupIds = lite ? new Map<string, string[]>() : await resolveBuildGroupMap(appId);

  const metricsMap = lite
    ? new Map<string, BuildMetrics>()
    : await fetchBuildMetrics(
        dataArr
          .filter((b) => (b.attributes.processingState as string) === "VALID")
          .map((b) => b.id),
      );

  const builds: TFBuild[] = dataArr.map((b) => {
    const attrs = b.attributes;

    // Resolve preReleaseVersion
    const prvRef = b.relationships?.preReleaseVersion?.data;
    const prvData = prvRef && !Array.isArray(prvRef)
      ? includedMap.get(`${prvRef.type}:${prvRef.id}`)
      : undefined;

    // Resolve buildBetaDetail
    const bbdRef = b.relationships?.buildBetaDetail?.data;
    const bbdData = bbdRef && !Array.isArray(bbdRef)
      ? includedMap.get(`${bbdRef.type}:${bbdRef.id}`)
      : undefined;

    // Resolve first betaBuildLocalization for whatsNew
    const bblRef = b.relationships?.betaBuildLocalizations?.data;
    const bblIds = Array.isArray(bblRef) ? bblRef : bblRef ? [bblRef] : [];
    const firstLocalization = bblIds.length > 0
      ? includedMap.get(`${bblIds[0].type}:${bblIds[0].id}`)
      : undefined;

    const processingState = attrs.processingState as string;
    const externalBuildState = bbdData?.attributes?.externalBuildState as string | null ?? null;
    const internalBuildState = bbdData?.attributes?.internalBuildState as string | null ?? null;
    const expired = (attrs.expired as boolean) ?? false;

    // Icon URL
    const iconToken = attrs.iconAssetToken as { templateUrl: string } | null;
    const iconUrl = iconToken?.templateUrl ? buildIconUrl(iconToken.templateUrl, 64) : null;

    const metrics = metricsMap.get(b.id);

    return {
      id: b.id,
      buildNumber: attrs.version as string,
      versionString: prvData?.attributes?.version as string ?? "",
      platform: prvData?.attributes?.platform as string ?? "IOS",
      status: deriveBuildStatus(processingState, externalBuildState, internalBuildState, expired),
      internalBuildState,
      externalBuildState,
      uploadedDate: attrs.uploadedDate as string,
      expirationDate: (attrs.expirationDate as string) ?? null,
      expired,
      minOsVersion: (attrs.minOsVersion as string) ?? null,
      whatsNew: (firstLocalization?.attributes?.whatsNew as string) ?? null,
      whatsNewLocalizationId: firstLocalization?.id ?? null,
      groupIds: buildToGroupIds.get(b.id) ?? [],
      iconUrl,
      installs: metrics?.installs ?? 0,
      sessions: metrics?.sessions ?? 0,
      crashes: metrics?.crashes ?? 0,
      invites: metrics?.invites ?? 0,
      feedbackCount: metrics?.feedbackCount ?? 0,
    };
  });

  return builds;
  });
}

// ── Build metrics ────────────────────────────────────────────────

interface BuildMetrics {
  installs: number;
  sessions: number;
  crashes: number;
  invites: number;
  feedbackCount: number;
}

export async function fetchBuildMetrics(
  buildIds: string[],
): Promise<Map<string, BuildMetrics>> {
  const map = new Map<string, BuildMetrics>();
  if (buildIds.length === 0) return map;

  // Batch in groups of 10 to avoid overwhelming the API
  const batchSize = 10;
  for (let i = 0; i < buildIds.length; i += batchSize) {
    const batch = buildIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        try {
          const response = await ascFetch<Record<string, unknown>>(
            `/v1/builds/${id}/metrics/betaBuildUsages`,
          );
          let installs = 0, sessions = 0, crashes = 0, invites = 0, feedbackCount = 0;

          // Metrics endpoints return { data: [{ dataPoints: [{ values: { ... } }] }] }
          const dataArr = Array.isArray(response.data) ? response.data : [];
          for (const item of dataArr as Record<string, unknown>[]) {
            const dataPoints = Array.isArray(item.dataPoints) ? item.dataPoints : [];
            for (const dp of dataPoints as Record<string, unknown>[]) {
              const values = dp.values as Record<string, number> | undefined;
              if (values) {
                installs += values.installCount ?? 0;
                sessions += values.sessionCount ?? 0;
                crashes += values.crashCount ?? 0;
                invites += values.inviteCount ?? 0;
                feedbackCount += values.feedbackCount ?? 0;
              }
            }
          }

          map.set(id, { installs, sessions, crashes, invites, feedbackCount });
        } catch (err) {
          // Metrics are best-effort – don't fail the whole build list
          console.warn(`[testflight] build ${id} metrics failed:`, err);
          map.set(id, { installs: 0, sessions: 0, crashes: 0, invites: 0, feedbackCount: 0 });
        }
      }),
    );
    // Log failures silently
    for (const r of results) {
      if (r.status === "rejected") {
        console.warn("[testflight] build metrics fetch failed:", r.reason);
      }
    }
  }

  return map;
}

// ── Build-to-group cross-reference ───────────────────────────────
// The ASC endpoint /v1/builds/{id}/betaGroups returns empty (known quirk).
// Instead, for each group we fetch its builds and build the reverse map.

async function resolveBuildGroupMap(
  appId: string,
): Promise<Map<string, string[]>> {
  const groups = await listGroups(appId);
  const map = new Map<string, string[]>();

  const results = await Promise.allSettled(
    groups.map(async (group) => {
      const res = await ascFetch<AscJsonApiResponse>(
        `/v1/betaGroups/${group.id}/builds?fields[builds]=version&limit=200`,
      );
      const builds = normalizeArray(res.data);
      return { groupId: group.id, buildIds: builds.map((b) => b.id) };
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const buildId of result.value.buildIds) {
        const existing = map.get(buildId) ?? [];
        existing.push(result.value.groupId);
        map.set(buildId, existing);
      }
    }
  }

  return map;
}

// ── Build mutations ──────────────────────────────────────────────

export async function updateBetaBuildLocalization(
  locId: string,
  whatsNew: string,
): Promise<void> {
  await ascFetch(`/v1/betaBuildLocalizations/${locId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "betaBuildLocalizations",
        id: locId,
        attributes: { whatsNew },
      },
    }),
  });
  cacheInvalidatePrefix("tf-builds:");
}

export async function createBetaBuildLocalization(
  buildId: string,
  locale: string,
  whatsNew: string,
): Promise<string> {
  const res = await ascFetch<{ data: { id: string } }>("/v1/betaBuildLocalizations", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "betaBuildLocalizations",
        attributes: { locale, whatsNew },
        relationships: {
          build: { data: { type: "builds", id: buildId } },
        },
      },
    }),
  });
  cacheInvalidatePrefix("tf-builds:");
  return res.data.id;
}

export async function addBuildToGroups(
  buildId: string,
  groupIds: string[],
): Promise<void> {
  await ascFetch(`/v1/builds/${buildId}/relationships/betaGroups`, {
    method: "POST",
    body: JSON.stringify({
      data: groupIds.map((id) => ({ type: "betaGroups", id })),
    }),
  });
  cacheInvalidatePrefix("tf-builds:");
  cacheInvalidatePrefix("tf-groups:");
}

export async function removeBuildFromGroups(
  buildId: string,
  groupIds: string[],
): Promise<void> {
  await ascFetch(`/v1/builds/${buildId}/relationships/betaGroups`, {
    method: "DELETE",
    body: JSON.stringify({
      data: groupIds.map((id) => ({ type: "betaGroups", id })),
    }),
  });
  cacheInvalidatePrefix("tf-builds:");
  cacheInvalidatePrefix("tf-groups:");
}

// ── Build lifecycle actions ──────────────────────────────────────

export async function submitForBetaReview(buildId: string): Promise<void> {
  await ascFetch(`/v1/betaAppReviewSubmissions`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "betaAppReviewSubmissions",
        relationships: {
          build: { data: { type: "builds", id: buildId } },
        },
      },
    }),
  });
  cacheInvalidatePrefix("tf-builds:");
}

export async function expireBuild(buildId: string): Promise<void> {
  await ascFetch(`/v1/builds/${buildId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "builds",
        id: buildId,
        attributes: { expired: true },
      },
    }),
  });
  cacheInvalidatePrefix("tf-builds:");
}

export async function declareExportCompliance(
  buildId: string,
  usesNonExemptEncryption = false,
): Promise<void> {
  await ascFetch(`/v1/builds/${buildId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "builds",
        id: buildId,
        attributes: { usesNonExemptEncryption },
      },
    }),
  });
  cacheInvalidatePrefix("tf-builds:");
}

export async function notifyTesters(buildId: string): Promise<{ autoNotified: boolean }> {
  try {
    await ascFetch(`/v1/buildBetaNotifications`, {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "buildBetaNotifications",
          relationships: {
            build: { data: { type: "builds", id: buildId } },
          },
        },
      }),
    });
    return { autoNotified: false };
  } catch (err) {
    // 409 means auto-notify is enabled – testers were already notified
    if (err instanceof Error && err.message.includes("ASC API 409")) {
      return { autoNotified: true };
    }
    throw err;
  }
}
