import { ascFetch } from "../client";
import { buildIconUrl } from "../apps";
import { fetchBuildMetrics } from "./builds";
import { cacheGet, cacheSet, cacheInvalidatePrefix } from "@/lib/cache";
import {
  GROUPS_TTL,
  GROUP_DETAIL_TTL,
  deriveBuildStatus,
  type TFBuild,
  type TFGroup,
  type TFTester,
  type TFGroupDetail,
  type AscJsonApiResource,
  type AscJsonApiResponse,
} from "./types";

// ── Groups ───────────────────────────────────────────────────────

export async function listGroups(
  appId: string,
  forceRefresh = false,
): Promise<TFGroup[]> {
  const cacheKey = `tf-groups:${appId}`;

  if (!forceRefresh) {
    const cached = cacheGet<TFGroup[]>(cacheKey);
    if (cached) return cached;
  }

  const params = new URLSearchParams({
    "filter[app]": appId,
    "fields[betaGroups]": "name,isInternalGroup,publicLinkEnabled,publicLink,publicLinkLimit,publicLinkLimitEnabled,feedbackEnabled,hasAccessToAllBuilds,createdDate",
    limit: "50",
  });

  const response = await ascFetch<AscJsonApiResponse>(
    `/v1/betaGroups?${params}`,
  );

  const dataArr = Array.isArray(response.data) ? response.data : [response.data];

  // Fetch tester and build counts per group in parallel
  const countResults = await Promise.allSettled(
    dataArr.map(async (g) => {
      const [testersRes, buildsRes] = await Promise.all([
        ascFetch<AscJsonApiResponse>(`/v1/betaGroups/${g.id}/betaTesters?limit=1`).catch(() => null),
        ascFetch<AscJsonApiResponse>(`/v1/betaGroups/${g.id}/builds?limit=1`).catch(() => null),
      ]);
      // ASC returns a meta.paging.total for list endpoints
      const testerCount = (testersRes as any)?.meta?.paging?.total ?? 0;
      const buildCount = (buildsRes as any)?.meta?.paging?.total ?? 0;
      return { groupId: g.id, testerCount, buildCount };
    }),
  );

  const countsMap = new Map<string, { testerCount: number; buildCount: number }>();
  for (const result of countResults) {
    if (result.status === "fulfilled") {
      countsMap.set(result.value.groupId, result.value);
    }
  }

  const groups: TFGroup[] = dataArr.map((g) => {
    const attrs = g.attributes;
    const counts = countsMap.get(g.id);
    return {
      id: g.id,
      name: attrs.name as string,
      isInternal: (attrs.isInternalGroup as boolean) ?? false,
      testerCount: counts?.testerCount ?? 0,
      buildCount: counts?.buildCount ?? 0,
      publicLinkEnabled: (attrs.publicLinkEnabled as boolean) ?? false,
      publicLink: (attrs.publicLink as string) ?? null,
      publicLinkLimit: (attrs.publicLinkLimit as number) ?? null,
      publicLinkLimitEnabled: (attrs.publicLinkLimitEnabled as boolean) ?? false,
      feedbackEnabled: (attrs.feedbackEnabled as boolean) ?? false,
      hasAccessToAllBuilds: (attrs.hasAccessToAllBuilds as boolean) ?? false,
      createdDate: attrs.createdDate as string,
    };
  });

  cacheSet(cacheKey, groups, GROUPS_TTL);
  return groups;
}

// ── Group detail ─────────────────────────────────────────────────

export async function getGroupDetail(
  groupId: string,
  forceRefresh = false,
): Promise<TFGroupDetail | null> {
  const cacheKey = `tf-group:${groupId}`;

  if (!forceRefresh) {
    const cached = cacheGet<TFGroupDetail>(cacheKey);
    if (cached) return cached;
  }

  // Fetch group, its builds, and its testers in parallel
  // Note: relationship endpoints (/betaGroups/{id}/builds) don't support `include`,
  // so we fetch builds with basic fields and resolve related resources per-build.
  const [groupRes, buildsRes, testersRes] = await Promise.all([
    ascFetch<AscJsonApiResponse>(
      `/v1/betaGroups/${groupId}?fields[betaGroups]=name,isInternalGroup,publicLinkEnabled,publicLink,publicLinkLimit,publicLinkLimitEnabled,feedbackEnabled,hasAccessToAllBuilds,createdDate`,
    ),
    ascFetch<AscJsonApiResponse>(
      `/v1/betaGroups/${groupId}/builds?fields[builds]=version,uploadedDate,processingState,expirationDate,expired,iconAssetToken&limit=200`,
    ),
    ascFetch<AscJsonApiResponse>(
      `/v1/betaGroups/${groupId}/betaTesters?fields[betaTesters]=firstName,lastName,email,inviteType,state&limit=200`,
    ),
  ]);

  // Parse group
  const gData = Array.isArray(groupRes.data) ? groupRes.data[0] : groupRes.data;
  if (!gData) return null;
  const gAttrs = gData.attributes;

  const testerDataArr = Array.isArray(testersRes.data) ? testersRes.data : testersRes.data ? [testersRes.data] : [];
  const allBuildDataArr = Array.isArray(buildsRes.data) ? buildsRes.data : buildsRes.data ? [buildsRes.data] : [];
  // Skip expired builds – avoids unnecessary detail fetches and they're hidden in the UI
  const buildDataArr = allBuildDataArr.filter((b) => !(b.attributes.expired as boolean));

  const group: TFGroup = {
    id: gData.id,
    name: gAttrs.name as string,
    isInternal: (gAttrs.isInternalGroup as boolean) ?? false,
    testerCount: testerDataArr.length,
    buildCount: buildDataArr.length,
    publicLinkEnabled: (gAttrs.publicLinkEnabled as boolean) ?? false,
    publicLink: (gAttrs.publicLink as string) ?? null,
    publicLinkLimit: (gAttrs.publicLinkLimit as number) ?? null,
    publicLinkLimitEnabled: (gAttrs.publicLinkLimitEnabled as boolean) ?? false,
    feedbackEnabled: (gAttrs.feedbackEnabled as boolean) ?? false,
    hasAccessToAllBuilds: (gAttrs.hasAccessToAllBuilds as boolean) ?? false,
    createdDate: gAttrs.createdDate as string,
  };

  // Fetch preReleaseVersion and buildBetaDetail per build in parallel
  const buildDetails = await Promise.allSettled(
    buildDataArr.map(async (b) => {
      const [prvRes, bbdRes] = await Promise.all([
        ascFetch<AscJsonApiResponse>(
          `/v1/builds/${b.id}/preReleaseVersion?fields[preReleaseVersions]=version,platform`,
        ).catch(() => null),
        ascFetch<AscJsonApiResponse>(
          `/v1/builds/${b.id}/buildBetaDetail?fields[buildBetaDetails]=internalBuildState,externalBuildState`,
        ).catch(() => null),
      ]);
      const prvData = prvRes && !Array.isArray(prvRes.data) ? prvRes.data : null;
      const bbdData = bbdRes && !Array.isArray(bbdRes.data) ? bbdRes.data : null;
      return { buildId: b.id, prvData, bbdData };
    }),
  );

  const detailMap = new Map<string, { prvData: AscJsonApiResource | null; bbdData: AscJsonApiResource | null }>();
  for (const result of buildDetails) {
    if (result.status === "fulfilled") {
      detailMap.set(result.value.buildId, result.value);
    }
  }

  const builds: TFBuild[] = buildDataArr.map((b) => {
    const attrs = b.attributes;
    const detail = detailMap.get(b.id);

    const processingState = attrs.processingState as string;
    const externalBuildState = detail?.bbdData?.attributes?.externalBuildState as string | null ?? null;
    const internalBuildState = detail?.bbdData?.attributes?.internalBuildState as string | null ?? null;
    const expired = (attrs.expired as boolean) ?? false;
    const iconToken = attrs.iconAssetToken as { templateUrl: string } | null;

    return {
      id: b.id,
      buildNumber: attrs.version as string,
      versionString: detail?.prvData?.attributes?.version as string ?? "",
      platform: detail?.prvData?.attributes?.platform as string ?? "IOS",
      status: deriveBuildStatus(processingState, externalBuildState, internalBuildState, expired),
      internalBuildState,
      externalBuildState,
      uploadedDate: attrs.uploadedDate as string,
      expirationDate: (attrs.expirationDate as string) ?? null,
      expired,
      minOsVersion: null,
      whatsNew: null,
      whatsNewLocalizationId: null,
      groupIds: [groupId],
      iconUrl: iconToken?.templateUrl ? buildIconUrl(iconToken.templateUrl, 64) : null,
      installs: 0,
      sessions: 0,
      crashes: 0,
      invites: 0,
      feedbackCount: 0,
    };
  });

  // Sort newest first (relationship endpoint doesn't support sort)
  builds.sort((a, b) => new Date(b.uploadedDate).getTime() - new Date(a.uploadedDate).getTime());

  // Parse testers
  const testers: TFTester[] = testerDataArr.map((t) => {
    const attrs = t.attributes;
    return {
      id: t.id,
      firstName: (attrs.firstName as string) ?? "Anonymous",
      lastName: (attrs.lastName as string) ?? "",
      email: (attrs.email as string) ?? null,
      inviteType: (attrs.inviteType as string) ?? "EMAIL",
      state: (attrs.state as string) ?? "NOT_INVITED",
      sessions: 0,
      crashes: 0,
      feedbackCount: 0,
    };
  });

  // Fetch build metrics and tester metrics in parallel
  const [buildMetrics, testerMetrics] = await Promise.all([
    fetchBuildMetrics(builds.map((b) => b.id)),
    fetchTesterMetrics(groupId),
  ]);

  for (const build of builds) {
    const metrics = buildMetrics.get(build.id);
    if (metrics) {
      build.installs = metrics.installs;
      build.sessions = metrics.sessions;
      build.crashes = metrics.crashes;
    }
  }

  for (const tester of testers) {
    const metrics = testerMetrics.get(tester.id);
    if (metrics) {
      tester.sessions = metrics.sessions;
      tester.crashes = metrics.crashes;
      tester.feedbackCount = metrics.feedbackCount;
    }
  }

  const detail: TFGroupDetail = { group, builds, testers };
  cacheSet(cacheKey, detail, GROUP_DETAIL_TTL);
  return detail;
}

// ── Create / delete ──────────────────────────────────────────────

export async function createGroup(
  appId: string,
  name: string,
  isInternal: boolean,
): Promise<TFGroup> {
  const response = await ascFetch<AscJsonApiResponse>(`/v1/betaGroups`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "betaGroups",
        attributes: { name, isInternalGroup: isInternal },
        relationships: {
          app: { data: { type: "apps", id: appId } },
        },
      },
    }),
  });

  const g = Array.isArray(response.data) ? response.data[0] : response.data;
  const attrs = g.attributes;

  cacheInvalidatePrefix(`tf-groups:${appId}`);

  return {
    id: g.id,
    name: attrs.name as string,
    isInternal: (attrs.isInternalGroup as boolean) ?? false,
    testerCount: 0,
    buildCount: 0,
    publicLinkEnabled: (attrs.publicLinkEnabled as boolean) ?? false,
    publicLink: (attrs.publicLink as string) ?? null,
    publicLinkLimit: (attrs.publicLinkLimit as number) ?? null,
    publicLinkLimitEnabled: (attrs.publicLinkLimitEnabled as boolean) ?? false,
    feedbackEnabled: (attrs.feedbackEnabled as boolean) ?? false,
    hasAccessToAllBuilds: (attrs.hasAccessToAllBuilds as boolean) ?? false,
    createdDate: (attrs.createdDate as string) ?? new Date().toISOString(),
  };
}

export async function deleteGroup(groupId: string): Promise<void> {
  await ascFetch(`/v1/betaGroups/${groupId}`, { method: "DELETE" });
  cacheInvalidatePrefix("tf-groups:");
}

// ── Tester metrics ───────────────────────────────────────────────

interface TesterMetrics {
  sessions: number;
  crashes: number;
  feedbackCount: number;
}

export async function fetchTesterMetrics(
  groupId: string,
): Promise<Map<string, TesterMetrics>> {
  const map = new Map<string, TesterMetrics>();

  try {
    const response = await ascFetch<Record<string, unknown>>(
      `/v1/betaGroups/${groupId}/metrics/betaTesterUsages?groupBy=betaTesters`,
    );

    const dataArr = Array.isArray(response.data) ? response.data : [];
    for (const item of dataArr as Record<string, unknown>[]) {
      const dimensions = item.dimensions as Record<string, Record<string, unknown>> | undefined;
      const testerData = dimensions?.betaTesters?.data as { id: string } | undefined;
      if (!testerData?.id) continue;

      let sessions = 0, crashes = 0, feedbackCount = 0;
      const dataPoints = Array.isArray(item.dataPoints) ? item.dataPoints : [];
      for (const dp of dataPoints as Record<string, unknown>[]) {
        const values = dp.values as Record<string, number> | undefined;
        if (values) {
          sessions += values.sessionCount ?? 0;
          crashes += values.crashCount ?? 0;
          feedbackCount += values.feedbackCount ?? 0;
        }
      }

      map.set(testerData.id, { sessions, crashes, feedbackCount });
    }
  } catch {
    // Tester metrics are best-effort
  }

  return map;
}
