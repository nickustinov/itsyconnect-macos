import { ascFetch } from "../client";
import { cacheGet, cacheSet } from "@/lib/cache";
import { BUILDS_TTL } from "./types";
import type { PreReleaseVersion } from "../version-types";

const CACHE_PREFIX = "tf-pre-release-versions";

export async function listPreReleaseVersions(
  appId: string,
  forceRefresh = false,
): Promise<PreReleaseVersion[]> {
  const cacheKey = `${CACHE_PREFIX}:${appId}`;

  if (!forceRefresh) {
    const cached = cacheGet<PreReleaseVersion[]>(cacheKey);
    if (cached) return cached;
  }

  const params = new URLSearchParams({
    "filter[app]": appId,
    "fields[preReleaseVersions]": "version,platform",
    sort: "-version",
    limit: "200",
  });

  const response = await ascFetch<{
    data: Array<{ id: string; type: string; attributes: Record<string, unknown> }> | { id: string; type: string; attributes: Record<string, unknown> };
  }>(`/v1/preReleaseVersions?${params}`);

  const dataArr = Array.isArray(response.data) ? response.data : [response.data];

  const versions: PreReleaseVersion[] = dataArr.map((d) => ({
    id: d.id,
    version: d.attributes.version as string,
    platform: d.attributes.platform as string,
  }));

  cacheSet(cacheKey, versions, BUILDS_TTL);
  return versions;
}
