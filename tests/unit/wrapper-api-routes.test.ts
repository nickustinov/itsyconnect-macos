import { beforeEach, describe, expect, it, vi } from "vitest";

const mockHasCredentials = vi.fn();
const mockIsDemoMode = vi.fn();
const mockGetDemoAnalytics = vi.fn();
const mockGetDemoAppInfos = vi.fn();
const mockGetDemoAppInfoLocalizations = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheGetMeta = vi.fn();
const mockCacheSet = vi.fn();
const mockCacheInvalidate = vi.fn();
const mockBuildAnalyticsData = vi.fn();
const mockGetCachedAnalytics = vi.fn();
const mockGetReportInitiatedAt = vi.fn();
const mockListAppInfos = vi.fn();
const mockUpdateAppAttributes = vi.fn();
const mockUpdateAppInfoCategories = vi.fn();
const mockListAppInfoLocalizations = vi.fn();
const mockUpdateAppInfoLocalization = vi.fn();
const mockCreateAppInfoLocalization = vi.fn();
const mockDeleteAppInfoLocalization = vi.fn();
const mockInvalidateAppInfoLocalizationsCache = vi.fn();
const mockFindUnresolvedSubmission = vi.fn();
const mockReleaseVersion = vi.fn();
const mockInvalidateVersionsCache = vi.fn();
const mockUpdateReviewDetail = vi.fn();
const mockCreateReviewDetail = vi.fn();
const mockSubmitForReview = vi.fn();
const mockCancelSubmission = vi.fn();
const mockCancelUnresolvedSubmission = vi.fn();
const mockSyncLocalizations = vi.fn();
const mockErrorJson = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: () => mockHasCredentials(),
}));

vi.mock("@/lib/demo", () => ({
  isDemoMode: () => mockIsDemoMode(),
  getDemoAnalytics: (...args: unknown[]) => mockGetDemoAnalytics(...args),
  getDemoAppInfos: (...args: unknown[]) => mockGetDemoAppInfos(...args),
  getDemoAppInfoLocalizations: (...args: unknown[]) => mockGetDemoAppInfoLocalizations(...args),
}));

vi.mock("@/lib/cache", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheGetMeta: (...args: unknown[]) => mockCacheGetMeta(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  cacheInvalidate: (...args: unknown[]) => mockCacheInvalidate(...args),
}));

vi.mock("@/lib/asc/analytics", () => ({
  buildAnalyticsData: (...args: unknown[]) => mockBuildAnalyticsData(...args),
  getCachedAnalytics: (...args: unknown[]) => mockGetCachedAnalytics(...args),
  getReportInitiatedAt: (...args: unknown[]) => mockGetReportInitiatedAt(...args),
}));

vi.mock("@/lib/asc/app-info", () => ({
  listAppInfos: (...args: unknown[]) => mockListAppInfos(...args),
  updateAppInfoCategories: (...args: unknown[]) => mockUpdateAppInfoCategories(...args),
  listAppInfoLocalizations: (...args: unknown[]) => mockListAppInfoLocalizations(...args),
}));

vi.mock("@/lib/asc/apps", () => ({
  updateAppAttributes: (...args: unknown[]) => mockUpdateAppAttributes(...args),
}));

vi.mock("@/lib/asc/localization-mutations", () => ({
  updateAppInfoLocalization: (...args: unknown[]) => mockUpdateAppInfoLocalization(...args),
  createAppInfoLocalization: (...args: unknown[]) => mockCreateAppInfoLocalization(...args),
  deleteAppInfoLocalization: (...args: unknown[]) => mockDeleteAppInfoLocalization(...args),
  invalidateAppInfoLocalizationsCache: (...args: unknown[]) => mockInvalidateAppInfoLocalizationsCache(...args),
}));

vi.mock("@/lib/asc/review-mutations", () => ({
  updateReviewDetail: (...args: unknown[]) => mockUpdateReviewDetail(...args),
  createReviewDetail: (...args: unknown[]) => mockCreateReviewDetail(...args),
  invalidateVersionsCache: (...args: unknown[]) => mockInvalidateVersionsCache(...args),
}));

vi.mock("@/lib/asc/version-mutations", () => ({
  findUnresolvedSubmission: (...args: unknown[]) => mockFindUnresolvedSubmission(...args),
  releaseVersion: (...args: unknown[]) => mockReleaseVersion(...args),
  invalidateVersionsCache: (...args: unknown[]) => mockInvalidateVersionsCache(...args),
  submitForReview: (...args: unknown[]) => mockSubmitForReview(...args),
  cancelSubmission: (...args: unknown[]) => mockCancelSubmission(...args),
  cancelUnresolvedSubmission: (...args: unknown[]) => mockCancelUnresolvedSubmission(...args),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    syncLocalizations: (...args: unknown[]) => mockSyncLocalizations(...args),
    errorJson: (...args: unknown[]) => mockErrorJson(...args),
  };
});

describe("wrapper API routes", () => {
  beforeEach(() => {
    mockHasCredentials.mockReset();
    mockHasCredentials.mockReturnValue(true);
    mockIsDemoMode.mockReset();
    mockIsDemoMode.mockReturnValue(false);
    mockGetDemoAnalytics.mockReset();
    mockGetDemoAppInfos.mockReset();
    mockGetDemoAppInfoLocalizations.mockReset();
    mockCacheGet.mockReset();
    mockCacheGetMeta.mockReset();
    mockCacheSet.mockReset();
    mockCacheInvalidate.mockReset();
    mockBuildAnalyticsData.mockReset();
    mockBuildAnalyticsData.mockResolvedValue(undefined);
    mockGetCachedAnalytics.mockReset();
    mockGetCachedAnalytics.mockReturnValue(null);
    mockGetReportInitiatedAt.mockReset();
    mockGetReportInitiatedAt.mockReturnValue(null);
    mockListAppInfos.mockReset();
    mockUpdateAppAttributes.mockReset();
    mockUpdateAppInfoCategories.mockReset();
    mockListAppInfoLocalizations.mockReset();
    mockUpdateAppInfoLocalization.mockReset();
    mockCreateAppInfoLocalization.mockReset();
    mockDeleteAppInfoLocalization.mockReset();
    mockInvalidateAppInfoLocalizationsCache.mockReset();
    mockFindUnresolvedSubmission.mockReset();
    mockReleaseVersion.mockReset();
    mockInvalidateVersionsCache.mockReset();
    mockUpdateReviewDetail.mockReset();
    mockCreateReviewDetail.mockReset();
    mockSubmitForReview.mockReset();
    mockCancelSubmission.mockReset();
    mockCancelUnresolvedSubmission.mockReset();
    mockSyncLocalizations.mockReset();
    mockErrorJson.mockReset();
    mockErrorJson.mockImplementation(
      (_err, status = 500) =>
        new Response(JSON.stringify({ error: "mapped" }), { status: status as number }),
    );
    vi.stubGlobal("fetch", vi.fn());
    vi.resetModules();
  });

  it("GET /api/apps/[appId]/analytics returns demo analytics", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/analytics/route");
    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoAnalytics.mockReturnValue({ dailyDownloads: [] });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(await response.json()).toEqual({
      data: { dailyDownloads: [] },
      meta: null,
    });
  });

  it("GET /api/apps/[appId]/analytics returns cached analytics with metadata", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/analytics/route");
    const analytics = { dailyDownloads: [{ date: "2026-03-01", firstTime: 4 }], dailyRevenue: [] };
    mockGetCachedAnalytics.mockReturnValue(analytics);
    mockCacheGetMeta.mockReturnValue({ updatedAt: 123 });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockGetCachedAnalytics).toHaveBeenCalledWith("app-1");
    expect(mockCacheGetMeta).toHaveBeenCalledWith("analytics:app-1");
    expect(await response.json()).toEqual({ data: analytics, meta: { updatedAt: 123 } });
  });

  it("GET /api/apps/[appId]/analytics returns pending and triggers a background build", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/analytics/route");
    mockGetReportInitiatedAt.mockReturnValue("2026-03-10T00:00:00.000Z");

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockBuildAnalyticsData).toHaveBeenCalledWith("app-1");
    expect(await response.json()).toEqual({
      data: null,
      pending: true,
      reportInitiated: true,
      initiatedAt: "2026-03-10T00:00:00.000Z",
    });
  });

  it("analytics route handles missing credentials and pending-without-report state", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/analytics/route");

    mockHasCredentials.mockReturnValue(false);
    let response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ data: null, meta: null });

    mockHasCredentials.mockReturnValue(true);
    mockGetReportInitiatedAt.mockReturnValue(null);
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ data: null, pending: true });
  });

  it("GET /api/apps/[appId]/analytics logs error when background build fails", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/analytics/route");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockBuildAnalyticsData.mockRejectedValue(new Error("build failed"));

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    // Wait for the fire-and-forget promise to settle
    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Background build failed for app-1"),
        expect.any(Error),
      );
    });
    expect(await response.json()).toMatchObject({ data: null, pending: true });
    consoleSpy.mockRestore();
  });

  it("POST /api/apps/[appId]/analytics/refresh keeps accumulated analytics and forces a rebuild", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/refresh/route");

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    // Analytics cache is preserved (accumulated history); only perf metrics are invalidated.
    expect(mockCacheInvalidate).not.toHaveBeenCalledWith("analytics:app-1");
    expect(mockCacheInvalidate).toHaveBeenCalledWith("perf-metrics:app-1");
    expect(mockBuildAnalyticsData).toHaveBeenCalledWith("app-1", { force: true });
    expect(await response.json()).toEqual({ ok: true });
  });

  it("POST /api/apps/[appId]/analytics/refresh logs error when background rebuild fails", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/refresh/route");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockBuildAnalyticsData.mockRejectedValue(new Error("rebuild failed"));

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Refresh failed for app-1"),
      expect.any(Error),
    );
    expect(await response.json()).toEqual({ ok: true });
    consoleSpy.mockRestore();
  });

  it("analytics refresh short-circuits in demo and no-credential modes", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/refresh/route");

    mockIsDemoMode.mockReturnValue(true);
    let response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });
    expect(mockCacheInvalidate).not.toHaveBeenCalled();

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });
    expect(mockBuildAnalyticsData).not.toHaveBeenCalled();
  });

  it("PATCH /api/apps/[appId]/attributes forwards mutable attributes", async () => {
    const { PATCH } = await import("@/app/api/apps/[appId]/attributes/route");

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentRightsDeclaration: "USES_THIRD_PARTY_CONTENT",
          subscriptionStatusUrl: "https://example.com/status",
          subscriptionStatusUrlForSandbox: null,
        }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );

    expect(mockUpdateAppAttributes).toHaveBeenCalledWith("app-1", {
      contentRightsDeclaration: "USES_THIRD_PARTY_CONTENT",
      subscriptionStatusUrl: "https://example.com/status",
      subscriptionStatusUrlForSandbox: null,
    });
    expect(await response.json()).toEqual({ ok: true });
  });

  it("attributes route handles demo, missing credentials, and mapped failures", async () => {
    const { PATCH } = await import("@/app/api/apps/[appId]/attributes/route");

    mockIsDemoMode.mockReturnValue(true);
    let response = await PATCH(new Request("http://localhost", { method: "PATCH" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await PATCH(new Request("http://localhost", { method: "PATCH" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No credentials" });

    mockHasCredentials.mockReturnValue(true);
    mockUpdateAppAttributes.mockRejectedValueOnce(new Error("boom"));
    response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentRightsDeclaration: "USES_THIRD_PARTY_CONTENT" }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("GET /api/apps/[appId]/info returns demo app infos", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/info/route");
    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoAppInfos.mockReturnValue([{ id: "info-1" }]);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(await response.json()).toEqual({ appInfos: [{ id: "info-1" }], meta: null });
  });

  it("GET /api/apps/[appId]/info returns app infos and cache metadata", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/info/route");
    mockListAppInfos.mockResolvedValue([{ id: "info-1" }]);
    mockCacheGetMeta.mockReturnValue({ updatedAt: 456 });

    const response = await GET(new Request("http://localhost?refresh=1"), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockListAppInfos).toHaveBeenCalledWith("app-1", true);
    expect(await response.json()).toEqual({
      appInfos: [{ id: "info-1" }],
      meta: { updatedAt: 456 },
    });
  });

  it("info route handles missing credentials and mapped failures", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/info/route");

    mockHasCredentials.mockReturnValue(false);
    let response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ appInfos: [], meta: null });

    mockHasCredentials.mockReturnValue(true);
    mockListAppInfos.mockRejectedValueOnce(new Error("boom"));
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("PATCH /api/apps/[appId]/info/[appInfoId]/categories updates selected categories", async () => {
    const { PATCH } = await import("@/app/api/apps/[appId]/info/[appInfoId]/categories/route");

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryCategoryId: "cat-1",
          secondaryCategoryId: "cat-2",
        }),
      }),
      { params: Promise.resolve({ appId: "app-1", appInfoId: "info-1" }) },
    );

    expect(mockUpdateAppInfoCategories).toHaveBeenCalledWith(
      "info-1",
      "app-1",
      "cat-1",
      "cat-2",
    );
    expect(await response.json()).toEqual({ ok: true });
  });

  it("categories route handles demo, missing credentials, and mapped failures", async () => {
    const { PATCH } = await import("@/app/api/apps/[appId]/info/[appInfoId]/categories/route");

    mockIsDemoMode.mockReturnValue(true);
    let response = await PATCH(new Request("http://localhost", { method: "PATCH" }), {
      params: Promise.resolve({ appId: "app-1", appInfoId: "info-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await PATCH(new Request("http://localhost", { method: "PATCH" }), {
      params: Promise.resolve({ appId: "app-1", appInfoId: "info-1" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No credentials" });

    mockHasCredentials.mockReturnValue(true);
    mockUpdateAppInfoCategories.mockRejectedValueOnce(new Error("boom"));
    response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryCategoryId: "cat-1", secondaryCategoryId: null }),
      }),
      { params: Promise.resolve({ appId: "app-1", appInfoId: "info-1" }) },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("GET /api/apps/[appId]/info/[appInfoId]/localizations returns demo localizations", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/info/[appInfoId]/localizations/route");
    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoAppInfoLocalizations.mockReturnValue([{ id: "loc-1" }]);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", appInfoId: "info-1" }),
    });

    expect(await response.json()).toEqual({ localizations: [{ id: "loc-1" }], meta: null });
  });

  it("GET /api/apps/[appId]/info/[appInfoId]/localizations returns empty data without credentials", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/info/[appInfoId]/localizations/route");
    mockHasCredentials.mockReturnValue(false);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", appInfoId: "info-1" }),
    });

    expect(await response.json()).toEqual({ localizations: [], meta: null });
  });

  it("GET /api/apps/[appId]/info/[appInfoId]/localizations returns localizations and metadata", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/info/[appInfoId]/localizations/route");
    mockListAppInfoLocalizations.mockResolvedValue([{ id: "loc-1" }]);
    mockCacheGetMeta.mockReturnValue({ updatedAt: 999 });

    const response = await GET(new Request("http://localhost?refresh=1"), {
      params: Promise.resolve({ appId: "app-1", appInfoId: "info-1" }),
    });

    expect(mockListAppInfoLocalizations).toHaveBeenCalledWith("info-1", true);
    expect(await response.json()).toEqual({
      localizations: [{ id: "loc-1" }],
      meta: { updatedAt: 999 },
    });
  });

  it("GET /api/apps/[appId]/info/[appInfoId]/localizations maps fetch failures through errorJson", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/info/[appInfoId]/localizations/route");
    mockListAppInfoLocalizations.mockRejectedValue(new Error("boom"));

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", appInfoId: "info-1" }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("PUT /api/apps/[appId]/info/[appInfoId]/localizations delegates to syncLocalizations", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/info/[appInfoId]/localizations/route");
    mockSyncLocalizations.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, results: [] }), { status: 200 }),
    );
    const request = new Request("http://localhost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ localizations: [] }),
    });

    const response = await PUT(request, {
      params: Promise.resolve({ appId: "app-1", appInfoId: "info-1" }),
    });

    expect(mockSyncLocalizations).toHaveBeenCalledWith(request, "info-1", {
      update: expect.any(Function),
      create: expect.any(Function),
      delete: expect.any(Function),
      invalidateCache: expect.any(Function),
    });
    expect(await response.json()).toEqual({ ok: true, results: [] });
  });

  it("PUT /api/apps/[appId]/info/[appInfoId]/localizations short-circuits in demo mode", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/info/[appInfoId]/localizations/route");
    mockIsDemoMode.mockReturnValue(true);

    const response = await PUT(new Request("http://localhost", { method: "PUT" }), {
      params: Promise.resolve({ appId: "app-1", appInfoId: "info-1" }),
    });

    expect(await response.json()).toEqual({ ok: true, results: [] });
  });

  it("PUT /api/apps/[appId]/info/[appInfoId]/localizations rejects missing credentials", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/info/[appInfoId]/localizations/route");
    mockHasCredentials.mockReturnValue(false);

    const response = await PUT(new Request("http://localhost", { method: "PUT" }), {
      params: Promise.resolve({ appId: "app-1", appInfoId: "info-1" }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No credentials" });
  });

  it("PUT /api/apps/[appId]/info/[appInfoId]/localizations invokes invalidateCache callback via syncLocalizations", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/info/[appInfoId]/localizations/route");
    mockSyncLocalizations.mockImplementation(
      async (_req: unknown, _id: unknown, ops: { invalidateCache: () => void }) => {
        ops.invalidateCache();
        return new Response(JSON.stringify({ ok: true, results: [] }), { status: 200 });
      },
    );

    const request = new Request("http://localhost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ localizations: [] }),
    });

    await PUT(request, {
      params: Promise.resolve({ appId: "app-1", appInfoId: "info-1" }),
    });

    expect(mockInvalidateAppInfoLocalizationsCache).toHaveBeenCalledWith("info-1");
  });

  it("PUT /api/apps/[appId]/info/[appInfoId]/localizations maps sync failures through errorJson", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/info/[appInfoId]/localizations/route");
    mockSyncLocalizations.mockRejectedValue(new Error("sync failed"));

    const response = await PUT(new Request("http://localhost", { method: "PUT" }), {
      params: Promise.resolve({ appId: "app-1", appInfoId: "info-1" }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("GET /api/apps/[appId]/unresolved-submission reports unresolved status", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/unresolved-submission/route");
    mockFindUnresolvedSubmission.mockResolvedValue("submission-1");

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(await response.json()).toEqual({ hasUnresolved: true });
  });

  it("unresolved-submission handles demo and missing credentials", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/unresolved-submission/route");

    mockIsDemoMode.mockReturnValue(true);
    let response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ hasUnresolved: false });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No credentials" });
  });

  it("POST /api/apps/[appId]/versions/[versionId]/release-now releases and invalidates", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/[versionId]/release-now/route");

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });

    expect(mockReleaseVersion).toHaveBeenCalledWith("ver-1");
    expect(mockInvalidateVersionsCache).toHaveBeenCalledWith("app-1");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("release-now handles demo, missing credentials, and mapped failures", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/[versionId]/release-now/route");

    mockIsDemoMode.mockReturnValue(true);
    let response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No credentials" });

    mockHasCredentials.mockReturnValue(true);
    mockReleaseVersion.mockRejectedValueOnce(new Error("boom"));
    response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("PUT /api/apps/[appId]/versions/[versionId]/review updates an existing review detail", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/versions/[versionId]/review/route");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewDetailId: "review-1",
          attributes: { contactEmail: "qa@example.com" },
        }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );

    expect(mockUpdateReviewDetail).toHaveBeenCalledWith("review-1", {
      contactEmail: "qa@example.com",
    });
    expect(mockInvalidateVersionsCache).toHaveBeenCalledWith("app-1");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("PUT /api/apps/[appId]/versions/[versionId]/review creates a review detail when missing", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/versions/[versionId]/review/route");

    await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewDetailId: null,
          attributes: { demoAccountName: "demo" },
        }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );

    expect(mockCreateReviewDetail).toHaveBeenCalledWith("ver-1", {
      demoAccountName: "demo",
    });
  });

  it("review route handles demo, missing credentials, and mapped failures", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/versions/[versionId]/review/route");

    mockIsDemoMode.mockReturnValue(true);
    let response = await PUT(new Request("http://localhost", { method: "PUT" }), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await PUT(new Request("http://localhost", { method: "PUT" }), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No credentials" });

    mockHasCredentials.mockReturnValue(true);
    mockUpdateReviewDetail.mockRejectedValueOnce(new Error("boom"));
    response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewDetailId: "review-1",
          attributes: { contactEmail: "qa@example.com" },
        }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("POST /api/apps/[appId]/versions/[versionId]/submit-for-review validates platform", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/[versionId]/submit-for-review/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing platform" });
  });

  it("POST /api/apps/[appId]/versions/[versionId]/submit-for-review submits and invalidates", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/[versionId]/submit-for-review/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "IOS" }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );

    expect(mockSubmitForReview).toHaveBeenCalledWith("app-1", "ver-1", "IOS");
    expect(mockInvalidateVersionsCache).toHaveBeenCalledWith("app-1");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("submit-for-review handles demo, missing credentials, and mapped failures", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/[versionId]/submit-for-review/route");

    mockIsDemoMode.mockReturnValue(true);
    let response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No credentials" });

    mockHasCredentials.mockReturnValue(true);
    mockSubmitForReview.mockRejectedValueOnce(new Error("boom"));
    response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "IOS" }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("POST /api/apps/[appId]/versions/[versionId]/cancel-submission cancels unresolved submission when requested", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/[versionId]/cancel-submission/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unresolved: true }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );

    expect(mockCancelUnresolvedSubmission).toHaveBeenCalledWith("app-1");
    expect(mockCancelSubmission).not.toHaveBeenCalled();
    expect(mockInvalidateVersionsCache).toHaveBeenCalledWith("app-1");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("POST /api/apps/[appId]/versions/[versionId]/cancel-submission falls back to version cancellation", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/[versionId]/cancel-submission/route");

    await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid",
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );

    expect(mockCancelSubmission).toHaveBeenCalledWith("ver-1");
  });

  it("GET /api/screenshot-download validates url and streams allowed images", async () => {
    const { GET } = await import("@/app/api/screenshot-download/route");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("image-bytes", {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }),
    );

    const response = await GET(
      new Request("http://localhost/api/screenshot-download?url=https://is1-ssl.mzstatic.com/image.jpg&name=shot.jpg"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="shot.jpg"');
    expect(await response.text()).toBe("image-bytes");
  });

  it("GET /api/screenshot-download rejects invalid urls", async () => {
    const { GET } = await import("@/app/api/screenshot-download/route");

    const response = await GET(
      new Request("http://localhost/api/screenshot-download?url=https://example.com/image.jpg"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid URL" });
  });

  it("GET /api/screenshot-download returns 400 when url parameter is missing", async () => {
    const { GET } = await import("@/app/api/screenshot-download/route");

    const response = await GET(
      new Request("http://localhost/api/screenshot-download"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing url" });
  });

  it("GET /api/screenshot-download returns 400 for malformed URLs", async () => {
    const { GET } = await import("@/app/api/screenshot-download/route");

    const response = await GET(
      new Request("http://localhost/api/screenshot-download?url=not-a-url"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid URL" });
  });

  it("GET /api/screenshot-download returns 502 when upstream fetch fails", async () => {
    const { GET } = await import("@/app/api/screenshot-download/route");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 404 }),
    );

    const response = await GET(
      new Request("http://localhost/api/screenshot-download?url=https://is1-ssl.mzstatic.com/image.jpg"),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Failed to fetch image" });
  });
});
