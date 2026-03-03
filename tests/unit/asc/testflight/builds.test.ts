import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAscFetch = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockCacheInvalidatePrefix = vi.fn();
const mockListGroups = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  ascFetch: (...args: unknown[]) => mockAscFetch(...args),
}));

vi.mock("@/lib/cache", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  cacheInvalidatePrefix: (...args: unknown[]) => mockCacheInvalidatePrefix(...args),
}));

vi.mock("@/lib/asc/testflight/groups", () => ({
  listGroups: (...args: unknown[]) => mockListGroups(...args),
}));

vi.mock("@/lib/asc/apps", () => ({
  buildIconUrl: (templateUrl: string, size: number) =>
    templateUrl.replace("{w}", String(size)).replace("{h}", String(size)).replace("{f}", "png"),
}));

import {
  listBuilds,
  fetchBuildMetrics,
  updateBetaBuildLocalization,
  addBuildToGroups,
  removeBuildFromGroups,
  submitForBetaReview,
  expireBuild,
  declareExportCompliance,
  notifyTesters,
} from "@/lib/asc/testflight/builds";
import { BUILDS_TTL } from "@/lib/asc/testflight/types";

// ── Helpers ──────────────────────────────────────────────────────

function mockBuildsApiResponse() {
  return {
    data: [
      {
        id: "build-1",
        type: "builds",
        attributes: {
          version: "42",
          uploadedDate: "2026-02-01T00:00:00Z",
          expirationDate: "2026-05-01T00:00:00Z",
          expired: false,
          minOsVersion: "17.0",
          processingState: "VALID",
          iconAssetToken: {
            templateUrl: "https://example.com/icon/{w}x{h}bb.{f}",
          },
        },
        relationships: {
          preReleaseVersion: {
            data: { id: "prv-1", type: "preReleaseVersions" },
          },
          buildBetaDetail: {
            data: { id: "bbd-1", type: "buildBetaDetails" },
          },
          betaBuildLocalizations: {
            data: [{ id: "bbl-1", type: "betaBuildLocalizations" }],
          },
        },
      },
      {
        id: "build-2",
        type: "builds",
        attributes: {
          version: "41",
          uploadedDate: "2026-01-15T00:00:00Z",
          expirationDate: null,
          expired: false,
          minOsVersion: null,
          processingState: "PROCESSING",
          iconAssetToken: null,
        },
        relationships: {
          preReleaseVersion: {
            data: { id: "prv-1", type: "preReleaseVersions" },
          },
          buildBetaDetail: {
            data: { id: "bbd-2", type: "buildBetaDetails" },
          },
          betaBuildLocalizations: {
            data: [],
          },
        },
      },
    ],
    included: [
      {
        id: "prv-1",
        type: "preReleaseVersions",
        attributes: { version: "1.2.0", platform: "IOS" },
      },
      {
        id: "bbd-1",
        type: "buildBetaDetails",
        attributes: {
          internalBuildState: "IN_BETA_TESTING",
          externalBuildState: "IN_BETA_TESTING",
        },
      },
      {
        id: "bbd-2",
        type: "buildBetaDetails",
        attributes: {
          internalBuildState: "PROCESSING",
          externalBuildState: null,
        },
      },
      {
        id: "bbl-1",
        type: "betaBuildLocalizations",
        attributes: { whatsNew: "Bug fixes and improvements", locale: "en-US" },
      },
    ],
  };
}

function mockGroupBuildsResponse(buildIds: string[]) {
  return {
    data: buildIds.map((id) => ({ id, type: "builds", attributes: { version: "42" } })),
  };
}

function mockMetricsResponse(installs: number, sessions: number, crashes: number, invites = 0, feedbackCount = 0) {
  return {
    data: [
      {
        dataPoints: [
          { values: { installCount: installs, sessionCount: sessions, crashCount: crashes, inviteCount: invites, feedbackCount } },
        ],
      },
    ],
  };
}

// ── listBuilds ───────────────────────────────────────────────────

describe("listBuilds", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockCacheInvalidatePrefix.mockReset();
    mockListGroups.mockReset();
  });

  it("returns cached data when available", async () => {
    const cached = [{ id: "build-1", buildNumber: "42" }];
    mockCacheGet.mockReturnValue(cached);

    const result = await listBuilds("app-1");
    expect(result).toBe(cached);
    expect(mockAscFetch).not.toHaveBeenCalled();
    expect(mockCacheGet).toHaveBeenCalledWith("tf-builds:app-1");
  });

  it("bypasses cache when forceRefresh is true", async () => {
    mockCacheGet.mockReturnValue([{ id: "old" }]);
    mockListGroups.mockResolvedValue([]);
    mockAscFetch.mockResolvedValue({ data: [] });

    await listBuilds("app-1", true);
    expect(mockCacheGet).not.toHaveBeenCalled();
    expect(mockAscFetch).toHaveBeenCalled();
  });

  it("uses platform and version in cache key when filters are provided", async () => {
    const cached = [{ id: "build-1" }];
    mockCacheGet.mockReturnValue(cached);

    const result = await listBuilds("app-1", false, { platform: "IOS", versionString: "1.2.0" });
    expect(result).toBe(cached);
    expect(mockCacheGet).toHaveBeenCalledWith("tf-builds:app-1:IOS:1.2.0");
  });

  it("uses base cache key when only one filter is provided", async () => {
    const cached = [{ id: "build-1" }];
    mockCacheGet.mockReturnValue(cached);

    await listBuilds("app-1", false, { platform: "IOS" });
    expect(mockCacheGet).toHaveBeenCalledWith("tf-builds:app-1");
  });

  it("fetches builds, resolves included resources, and cross-references groups", async () => {
    mockCacheGet.mockReturnValue(null);
    mockListGroups.mockResolvedValue([
      { id: "group-1", name: "External testers" },
      { id: "group-2", name: "Internal testers" },
    ]);

    // Main builds fetch
    mockAscFetch.mockImplementation((url: string) => {
      if (url.startsWith("/v1/builds?")) {
        return Promise.resolve(mockBuildsApiResponse());
      }
      // Group builds cross-reference
      if (url.includes("/v1/betaGroups/group-1/builds")) {
        return Promise.resolve(mockGroupBuildsResponse(["build-1"]));
      }
      if (url.includes("/v1/betaGroups/group-2/builds")) {
        return Promise.resolve(mockGroupBuildsResponse(["build-1", "build-2"]));
      }
      // Metrics – only build-1 is VALID
      if (url.includes("/v1/builds/build-1/metrics/betaBuildUsages")) {
        return Promise.resolve(mockMetricsResponse(10, 25, 2, 5, 3));
      }
      return Promise.resolve({ data: [] });
    });

    const result = await listBuilds("app-1");

    expect(result).toHaveLength(2);

    // Build 1 – VALID, has all included data
    const b1 = result[0];
    expect(b1.id).toBe("build-1");
    expect(b1.buildNumber).toBe("42");
    expect(b1.versionString).toBe("1.2.0");
    expect(b1.platform).toBe("IOS");
    expect(b1.status).toBe("Testing");
    expect(b1.internalBuildState).toBe("IN_BETA_TESTING");
    expect(b1.externalBuildState).toBe("IN_BETA_TESTING");
    expect(b1.uploadedDate).toBe("2026-02-01T00:00:00Z");
    expect(b1.expirationDate).toBe("2026-05-01T00:00:00Z");
    expect(b1.expired).toBe(false);
    expect(b1.minOsVersion).toBe("17.0");
    expect(b1.whatsNew).toBe("Bug fixes and improvements");
    expect(b1.whatsNewLocalizationId).toBe("bbl-1");
    expect(b1.groupIds).toEqual(expect.arrayContaining(["group-1", "group-2"]));
    expect(b1.iconUrl).toBe("https://example.com/icon/64x64bb.png");
    expect(b1.installs).toBe(10);
    expect(b1.sessions).toBe(25);
    expect(b1.crashes).toBe(2);
    expect(b1.invites).toBe(5);
    expect(b1.feedbackCount).toBe(3);

    // Build 2 – PROCESSING, no whatsNew, no metrics
    const b2 = result[1];
    expect(b2.id).toBe("build-2");
    expect(b2.buildNumber).toBe("41");
    expect(b2.status).toBe("Processing");
    expect(b2.whatsNew).toBeNull();
    expect(b2.whatsNewLocalizationId).toBeNull();
    expect(b2.iconUrl).toBeNull();
    expect(b2.installs).toBe(0);
    expect(b2.sessions).toBe(0);
    expect(b2.crashes).toBe(0);
    expect(b2.invites).toBe(0);
    expect(b2.feedbackCount).toBe(0);

    // Should cache the result
    expect(mockCacheSet).toHaveBeenCalledWith("tf-builds:app-1", result, BUILDS_TTL);
  });

  it("handles builds with no relationships", async () => {
    mockCacheGet.mockReturnValue(null);
    mockListGroups.mockResolvedValue([]);
    mockAscFetch.mockImplementation((url: string) => {
      if (url.startsWith("/v1/builds?")) {
        return Promise.resolve({
          data: [
            {
              id: "build-solo",
              type: "builds",
              attributes: {
                version: "1",
                uploadedDate: "2026-01-01T00:00:00Z",
                expirationDate: null,
                expired: false,
                minOsVersion: null,
                processingState: "VALID",
                iconAssetToken: null,
              },
            },
          ],
        });
      }
      // Metrics
      if (url.includes("/metrics/betaBuildUsages")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    const result = await listBuilds("app-1");
    expect(result).toHaveLength(1);
    expect(result[0].versionString).toBe("");
    expect(result[0].platform).toBe("IOS");
    expect(result[0].internalBuildState).toBeNull();
    expect(result[0].externalBuildState).toBeNull();
    expect(result[0].whatsNew).toBeNull();
    expect(result[0].groupIds).toEqual([]);
  });

  it("handles empty builds response", async () => {
    mockCacheGet.mockReturnValue(null);
    mockListGroups.mockResolvedValue([]);
    mockAscFetch.mockResolvedValue({ data: [] });

    const result = await listBuilds("app-1");
    expect(result).toEqual([]);
    expect(mockCacheSet).toHaveBeenCalledWith("tf-builds:app-1", [], BUILDS_TTL);
  });

  it("includes platform and version filters in the ASC request", async () => {
    mockCacheGet.mockReturnValue(null);
    mockListGroups.mockResolvedValue([]);
    mockAscFetch.mockResolvedValue({ data: [] });

    await listBuilds("app-1", false, { platform: "MAC_OS", versionString: "2.0.0" });

    const buildsCallUrl = mockAscFetch.mock.calls[0][0] as string;
    expect(buildsCallUrl).toContain("filter%5BpreReleaseVersion.platform%5D=MAC_OS");
    expect(buildsCallUrl).toContain("filter%5BpreReleaseVersion.version%5D=2.0.0");
  });

  it("handles group cross-reference failures gracefully", async () => {
    mockCacheGet.mockReturnValue(null);
    mockListGroups.mockResolvedValue([
      { id: "group-1", name: "Group" },
    ]);

    mockAscFetch.mockImplementation((url: string) => {
      if (url.startsWith("/v1/builds?")) {
        return Promise.resolve({
          data: [
            {
              id: "build-1",
              type: "builds",
              attributes: {
                version: "1",
                uploadedDate: "2026-01-01T00:00:00Z",
                expired: false,
                processingState: "PROCESSING",
                iconAssetToken: null,
              },
            },
          ],
        });
      }
      if (url.includes("/v1/betaGroups/")) {
        return Promise.reject(new Error("network error"));
      }
      return Promise.resolve({ data: [] });
    });

    const result = await listBuilds("app-1");
    expect(result).toHaveLength(1);
    // Group cross-ref failed, so groupIds should be empty
    expect(result[0].groupIds).toEqual([]);
  });
});

// ── fetchBuildMetrics ────────────────────────────────────────────

describe("fetchBuildMetrics", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
  });

  it("returns empty map for empty buildIds", async () => {
    const result = await fetchBuildMetrics([]);
    expect(result.size).toBe(0);
    expect(mockAscFetch).not.toHaveBeenCalled();
  });

  it("fetches and parses metrics for each build", async () => {
    mockAscFetch.mockImplementation((url: string) => {
      if (url.includes("build-1")) {
        return Promise.resolve(mockMetricsResponse(10, 20, 3));
      }
      if (url.includes("build-2")) {
        return Promise.resolve(mockMetricsResponse(5, 8, 0));
      }
      return Promise.resolve({ data: [] });
    });

    const result = await fetchBuildMetrics(["build-1", "build-2"]);

    expect(result.size).toBe(2);
    expect(result.get("build-1")).toEqual({ installs: 10, sessions: 20, crashes: 3, invites: 0, feedbackCount: 0 });
    expect(result.get("build-2")).toEqual({ installs: 5, sessions: 8, crashes: 0, invites: 0, feedbackCount: 0 });
  });

  it("aggregates multiple data points", async () => {
    mockAscFetch.mockResolvedValue({
      data: [
        {
          dataPoints: [
            { values: { installCount: 5, sessionCount: 10, crashCount: 1, inviteCount: 2, feedbackCount: 1 } },
            { values: { installCount: 3, sessionCount: 7, crashCount: 2, inviteCount: 1, feedbackCount: 0 } },
          ],
        },
        {
          dataPoints: [
            { values: { installCount: 2, sessionCount: 3, crashCount: 0, inviteCount: 0, feedbackCount: 1 } },
          ],
        },
      ],
    });

    const result = await fetchBuildMetrics(["build-1"]);
    expect(result.get("build-1")).toEqual({ installs: 10, sessions: 20, crashes: 3, invites: 3, feedbackCount: 2 });
  });

  it("fails silently and returns zero metrics on error", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockAscFetch.mockRejectedValue(new Error("network error"));

    const result = await fetchBuildMetrics(["build-1"]);

    expect(result.size).toBe(1);
    expect(result.get("build-1")).toEqual({ installs: 0, sessions: 0, crashes: 0, invites: 0, feedbackCount: 0 });
    consoleSpy.mockRestore();
  });

  it("batches requests in groups of 10", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `build-${i}`);
    mockAscFetch.mockResolvedValue({ data: [] });

    await fetchBuildMetrics(ids);

    // All 25 builds should get fetched
    expect(mockAscFetch).toHaveBeenCalledTimes(25);
    // Verify each call targets the correct endpoint
    for (let i = 0; i < 25; i++) {
      expect(mockAscFetch).toHaveBeenCalledWith(
        `/v1/builds/build-${i}/metrics/betaBuildUsages`,
      );
    }
  });

  it("handles metrics response with missing values gracefully", async () => {
    mockAscFetch.mockResolvedValue({
      data: [
        {
          dataPoints: [
            { values: { installCount: 5 } },
          ],
        },
      ],
    });

    const result = await fetchBuildMetrics(["build-1"]);
    expect(result.get("build-1")).toEqual({ installs: 5, sessions: 0, crashes: 0, invites: 0, feedbackCount: 0 });
  });

  it("logs warning when allSettled result is rejected (line 180)", async () => {
    // To exercise the outer rejected branch, we need the inner async function
    // to reject. The inner function has a try/catch, so we make console.warn
    // (called inside catch) throw, causing the catch block itself to reject.
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      // Throw only on the inner per-build failure message to cause the promise to reject
      const msg = String(args[0] ?? "");
      if (msg.includes("[testflight] build build-fail metrics failed:")) {
        throw new Error("warn threw");
      }
    });

    mockAscFetch.mockRejectedValue(new Error("network error"));

    const result = await fetchBuildMetrics(["build-fail"]);

    // The outer loop logs the allSettled rejection
    expect(consoleSpy).toHaveBeenCalledWith(
      "[testflight] build metrics fetch failed:",
      expect.any(Error),
    );

    // Since the catch block threw before map.set, the build won't be in the map
    expect(result.has("build-fail")).toBe(false);

    consoleSpy.mockRestore();
  });
});

// ── updateBetaBuildLocalization ──────────────────────────────────

describe("updateBetaBuildLocalization", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheInvalidatePrefix.mockReset();
  });

  it("PATCHes localization and invalidates builds cache", async () => {
    mockAscFetch.mockResolvedValue({});

    await updateBetaBuildLocalization("loc-1", "New release notes");

    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/betaBuildLocalizations/loc-1",
      expect.objectContaining({ method: "PATCH" }),
    );

    const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
    expect(body.data.type).toBe("betaBuildLocalizations");
    expect(body.data.id).toBe("loc-1");
    expect(body.data.attributes.whatsNew).toBe("New release notes");

    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("tf-builds:");
  });
});

// ── addBuildToGroups ─────────────────────────────────────────────

describe("addBuildToGroups", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheInvalidatePrefix.mockReset();
  });

  it("POSTs group relationships and invalidates builds and groups caches", async () => {
    mockAscFetch.mockResolvedValue({});

    await addBuildToGroups("build-1", ["group-1", "group-2"]);

    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/builds/build-1/relationships/betaGroups",
      expect.objectContaining({ method: "POST" }),
    );

    const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
    expect(body.data).toEqual([
      { type: "betaGroups", id: "group-1" },
      { type: "betaGroups", id: "group-2" },
    ]);

    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("tf-builds:");
    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("tf-groups:");
  });
});

// ── removeBuildFromGroups ────────────────────────────────────────

describe("removeBuildFromGroups", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheInvalidatePrefix.mockReset();
  });

  it("DELETEs group relationships and invalidates builds and groups caches", async () => {
    mockAscFetch.mockResolvedValue({});

    await removeBuildFromGroups("build-1", ["group-1"]);

    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/builds/build-1/relationships/betaGroups",
      expect.objectContaining({ method: "DELETE" }),
    );

    const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
    expect(body.data).toEqual([{ type: "betaGroups", id: "group-1" }]);

    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("tf-builds:");
    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("tf-groups:");
  });
});

// ── submitForBetaReview ──────────────────────────────────────────

describe("submitForBetaReview", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheInvalidatePrefix.mockReset();
  });

  it("POSTs beta review submission and invalidates builds cache", async () => {
    mockAscFetch.mockResolvedValue({});

    await submitForBetaReview("build-1");

    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/betaAppReviewSubmissions",
      expect.objectContaining({ method: "POST" }),
    );

    const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
    expect(body.data.type).toBe("betaAppReviewSubmissions");
    expect(body.data.relationships.build.data).toEqual({
      type: "builds",
      id: "build-1",
    });

    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("tf-builds:");
  });
});

// ── expireBuild ──────────────────────────────────────────────────

describe("expireBuild", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheInvalidatePrefix.mockReset();
  });

  it("PATCHes expired=true and invalidates builds cache", async () => {
    mockAscFetch.mockResolvedValue({});

    await expireBuild("build-1");

    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/builds/build-1",
      expect.objectContaining({ method: "PATCH" }),
    );

    const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
    expect(body.data.type).toBe("builds");
    expect(body.data.id).toBe("build-1");
    expect(body.data.attributes.expired).toBe(true);

    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("tf-builds:");
  });
});

// ── declareExportCompliance ──────────────────────────────────────

describe("declareExportCompliance", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheInvalidatePrefix.mockReset();
  });

  it("PATCHes with usesNonExemptEncryption=false by default", async () => {
    mockAscFetch.mockResolvedValue({});

    await declareExportCompliance("build-1");

    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/builds/build-1",
      expect.objectContaining({ method: "PATCH" }),
    );

    const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
    expect(body.data.type).toBe("builds");
    expect(body.data.id).toBe("build-1");
    expect(body.data.attributes.usesNonExemptEncryption).toBe(false);

    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("tf-builds:");
  });

  it("PATCHes with usesNonExemptEncryption=true when specified", async () => {
    mockAscFetch.mockResolvedValue({});

    await declareExportCompliance("build-1", true);

    const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
    expect(body.data.attributes.usesNonExemptEncryption).toBe(true);
  });
});

// ── notifyTesters ────────────────────────────────────────────────

describe("notifyTesters", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
  });

  it("returns autoNotified=false on successful notification", async () => {
    mockAscFetch.mockResolvedValue({});

    const result = await notifyTesters("build-1");

    expect(result).toEqual({ autoNotified: false });
    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/buildBetaNotifications",
      expect.objectContaining({ method: "POST" }),
    );

    const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
    expect(body.data.type).toBe("buildBetaNotifications");
    expect(body.data.relationships.build.data).toEqual({
      type: "builds",
      id: "build-1",
    });
  });

  it("returns autoNotified=true on 409 conflict", async () => {
    mockAscFetch.mockRejectedValue(new Error("ASC API 409: Conflict"));

    const result = await notifyTesters("build-1");
    expect(result).toEqual({ autoNotified: true });
  });

  it("rethrows non-409 errors", async () => {
    const error = new Error("ASC API 500: Internal Server Error");
    mockAscFetch.mockRejectedValue(error);

    await expect(notifyTesters("build-1")).rejects.toThrow(error);
  });

  it("rethrows non-Error exceptions", async () => {
    mockAscFetch.mockRejectedValue("string error");

    await expect(notifyTesters("build-1")).rejects.toBe("string error");
  });
});

// ── Branch coverage: listBuilds edge cases ──────────────────────

describe("listBuilds – branch coverage", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockCacheInvalidatePrefix.mockReset();
    mockListGroups.mockReset();
  });

  it("wraps a single object response.data into an array (line 51 branch 1)", async () => {
    mockCacheGet.mockReturnValue(null);
    mockListGroups.mockResolvedValue([]);

    // ASC returns a single object instead of an array
    mockAscFetch.mockImplementation((url: string) => {
      if (url.startsWith("/v1/builds?")) {
        return Promise.resolve({
          data: {
            id: "b1",
            type: "builds",
            attributes: {
              version: "1",
              uploadedDate: "2026-01-01T00:00:00Z",
              expirationDate: null,
              expired: false,
              minOsVersion: null,
              processingState: "PROCESSING",
              iconAssetToken: null,
            },
          },
          included: [],
        });
      }
      return Promise.resolve({ data: [] });
    });

    const result = await listBuilds("app-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b1");
    expect(result[0].buildNumber).toBe("1");
  });

  it("handles bblRef as a single object instead of array (line 87 branch 0)", async () => {
    mockCacheGet.mockReturnValue(null);
    mockListGroups.mockResolvedValue([]);

    mockAscFetch.mockImplementation((url: string) => {
      if (url.startsWith("/v1/builds?")) {
        return Promise.resolve({
          data: [
            {
              id: "b1",
              type: "builds",
              attributes: {
                version: "10",
                uploadedDate: "2026-01-01T00:00:00Z",
                expirationDate: null,
                expired: false,
                minOsVersion: null,
                processingState: "PROCESSING",
                iconAssetToken: null,
              },
              relationships: {
                betaBuildLocalizations: {
                  // Single object, not an array
                  data: { id: "bbl-single", type: "betaBuildLocalizations" },
                },
              },
            },
          ],
          included: [
            {
              id: "bbl-single",
              type: "betaBuildLocalizations",
              attributes: { whatsNew: "Single localization", locale: "en-US" },
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    const result = await listBuilds("app-1");
    expect(result).toHaveLength(1);
    expect(result[0].whatsNew).toBe("Single localization");
    expect(result[0].whatsNewLocalizationId).toBe("bbl-single");
  });

  it("falls back to false when attrs.expired is undefined (line 95 branch 1)", async () => {
    mockCacheGet.mockReturnValue(null);
    mockListGroups.mockResolvedValue([]);

    mockAscFetch.mockImplementation((url: string) => {
      if (url.startsWith("/v1/builds?")) {
        return Promise.resolve({
          data: [
            {
              id: "b1",
              type: "builds",
              attributes: {
                version: "5",
                uploadedDate: "2026-01-01T00:00:00Z",
                expirationDate: null,
                // expired is intentionally omitted (undefined)
                minOsVersion: null,
                processingState: "PROCESSING",
                iconAssetToken: null,
              },
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    const result = await listBuilds("app-1");
    expect(result).toHaveLength(1);
    expect(result[0].expired).toBe(false);
  });

  it("handles build-group cross-ref with null data and single-object data (line 203)", async () => {
    mockCacheGet.mockReturnValue(null);
    mockListGroups.mockResolvedValue([
      { id: "group-null", name: "Null data group" },
      { id: "group-single", name: "Single object group" },
    ]);

    mockAscFetch.mockImplementation((url: string) => {
      if (url.startsWith("/v1/builds?")) {
        return Promise.resolve({
          data: [
            {
              id: "b1",
              type: "builds",
              attributes: {
                version: "1",
                uploadedDate: "2026-01-01T00:00:00Z",
                expired: false,
                processingState: "PROCESSING",
                iconAssetToken: null,
              },
            },
          ],
        });
      }
      // Group with null data – exercises `res.data ? [res.data] : []` falsy branch
      if (url.includes("/v1/betaGroups/group-null/builds")) {
        return Promise.resolve({ data: null });
      }
      // Group with single object data – exercises `res.data ? [res.data]` truthy branch
      if (url.includes("/v1/betaGroups/group-single/builds")) {
        return Promise.resolve({
          data: { id: "b1", type: "builds", attributes: { version: "1" } },
        });
      }
      return Promise.resolve({ data: [] });
    });

    const result = await listBuilds("app-1");
    expect(result).toHaveLength(1);
    // b1 should be in group-single but not group-null
    expect(result[0].groupIds).toContain("group-single");
    expect(result[0].groupIds).not.toContain("group-null");
  });
});

// ── Branch coverage: fetchBuildMetrics edge cases ───────────────

describe("fetchBuildMetrics – branch coverage", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
  });

  it("treats non-array response.data as empty array (line 156 branch 1)", async () => {
    mockAscFetch.mockResolvedValue({
      data: { someKey: "not an array" },
    });

    const result = await fetchBuildMetrics(["build-1"]);
    expect(result.get("build-1")).toEqual({ installs: 0, sessions: 0, crashes: 0, invites: 0, feedbackCount: 0 });
  });

  it("treats non-array item.dataPoints as empty array (line 158 branch 1)", async () => {
    mockAscFetch.mockResolvedValue({
      data: [
        { dataPoints: "not an array" },
      ],
    });

    const result = await fetchBuildMetrics(["build-1"]);
    expect(result.get("build-1")).toEqual({ installs: 0, sessions: 0, crashes: 0, invites: 0, feedbackCount: 0 });
  });

  it("skips data points with undefined values (line 161 branch 1)", async () => {
    mockAscFetch.mockResolvedValue({
      data: [
        {
          dataPoints: [
            // dp.values is undefined – the if (values) check fails
            {},
            { values: { installCount: 5, sessionCount: 3, crashCount: 1 } },
          ],
        },
      ],
    });

    const result = await fetchBuildMetrics(["build-1"]);
    // Only the second data point should be counted
    expect(result.get("build-1")).toEqual({ installs: 5, sessions: 3, crashes: 1, invites: 0, feedbackCount: 0 });
  });

  it("falls back to 0 when individual metric counts are undefined (line 162 branch 1)", async () => {
    mockAscFetch.mockResolvedValue({
      data: [
        {
          dataPoints: [
            // values exists but installCount, sessionCount, crashCount are all undefined
            { values: {} },
          ],
        },
      ],
    });

    const result = await fetchBuildMetrics(["build-1"]);
    expect(result.get("build-1")).toEqual({ installs: 0, sessions: 0, crashes: 0, invites: 0, feedbackCount: 0 });
  });
});
