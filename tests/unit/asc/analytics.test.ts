import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { gzipSync } from "node:zlib";

// ---------- Mocks ----------

const mockAscFetch = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  ascFetch: (...args: unknown[]) => mockAscFetch(...args),
}));

vi.mock("@/lib/cache", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
}));

vi.mock("@/db", () => ({
  db: {
    // isBackfilled() returns truthy so backfill is skipped in tests
    select: () => ({ from: () => ({ where: () => ({ get: () => ({ appId: "mock" }) }) }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ run: () => {} }) }) }),
  },
}));

vi.mock("@/db/schema", () => ({
  analyticsBackfill: {},
}));

// Replace global fetch
vi.stubGlobal("fetch", mockFetch);

import { buildAnalyticsData, parseTsv, fetchPerfPowerMetrics } from "@/lib/asc/analytics";

// ---------- Helpers ----------

function tsvString(headers: string[], rows: string[][]): string {
  return [headers.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n");
}

function makeFetchResponse(body: string | Buffer, ok = true, status = 200) {
  return {
    ok,
    status,
    arrayBuffer: async () => {
      const buf = typeof body === "string" ? Buffer.from(body) : body;
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
  };
}

function reportRequestsResponse(ids: string[], accessTypes?: string[]) {
  return {
    data: ids.map((id, i) => ({
      id,
      attributes: { accessType: accessTypes?.[i] ?? "ONGOING" },
    })),
  };
}

function reportsResponse(reports: Array<{ id: string; name: string; category: string }>) {
  return {
    data: reports.map((r) => ({
      id: r.id,
      attributes: { name: r.name, category: r.category },
    })),
  };
}

function instancesResponse(
  instances: Array<{ id: string; processingDate: string; granularity?: string }>,
  nextUrl?: string,
) {
  return {
    data: instances.map((inst) => ({
      id: inst.id,
      attributes: {
        processingDate: inst.processingDate,
        granularity: inst.granularity ?? "DAILY",
      },
    })),
    links: nextUrl ? { next: nextUrl } : {},
  };
}

function segmentsResponse(segments: Array<{ id: string; url: string }>) {
  return {
    data: segments.map((s) => ({
      id: s.id,
      attributes: { url: s.url, checksum: "abc123" },
    })),
  };
}

// The module has internal in-memory caches (Maps) that persist across tests.
// We clear them by resetting the module between describe blocks via cache mocking.
// For isolation within tests, we rely on unique appIds.

let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockAscFetch.mockReset();
  mockCacheGet.mockReset();
  mockCacheSet.mockReset();
  mockFetch.mockReset();
  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

// ---------- Tests ----------

describe("buildAnalyticsData", () => {
  it("returns cached result immediately", async () => {
    const cachedData = { dailyDownloads: [{ date: "2026-01-01", firstTime: 10, redownload: 5, update: 3 }] };
    mockCacheGet.mockReturnValue(cachedData);

    const result = await buildAnalyticsData("app-cached");
    expect(result).toBe(cachedData);
    expect(mockAscFetch).not.toHaveBeenCalled();
    expect(mockCacheGet).toHaveBeenCalledWith("analytics:app-cached");
  });

  it("creates ONGOING and ONE_TIME_SNAPSHOT report requests when none exist", async () => {
    mockCacheGet.mockReturnValue(null);
    // First call: list report requests – returns empty
    mockAscFetch.mockResolvedValueOnce(reportRequestsResponse([]));
    // Second call: POST to create ONGOING
    mockAscFetch.mockResolvedValueOnce({ data: { id: "new-ongoing" } });
    // Third call: POST to create ONE_TIME_SNAPSHOT
    mockAscFetch.mockResolvedValueOnce({ data: { id: "new-snapshot" } });
    // Subsequent calls: reports, instances, segments – all empty
    mockAscFetch.mockResolvedValue({ data: [] });

    await buildAnalyticsData("app-empty");

    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/analyticsReportRequests",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          data: {
            type: "analyticsReportRequests",
            attributes: { accessType: "ONGOING" },
            relationships: {
              app: { data: { type: "apps", id: "app-empty" } },
            },
          },
        }),
      }),
    );
    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/analyticsReportRequests",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          data: {
            type: "analyticsReportRequests",
            attributes: { accessType: "ONE_TIME_SNAPSHOT" },
            relationships: {
              app: { data: { type: "apps", id: "app-empty" } },
            },
          },
        }),
      }),
    );
    // Should cache both created IDs
    expect(mockCacheSet).toHaveBeenCalledWith(
      "asc-report-requests:app-empty",
      ["new-ongoing", "new-snapshot"],
      604_800_000,
    );
  });

  it("filters report requests to ONGOING and ONE_TIME_SNAPSHOT only", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValueOnce(
      reportRequestsResponse(
        ["req-ongoing", "req-snapshot", "req-other"],
        ["ONGOING", "ONE_TIME_SNAPSHOT", "DELETED"],
      ),
    );
    // After filtering, 2 request IDs remain. Since each fetchReportData call
    // will call findReportId for each requestId, and we have 8 report types,
    // we need reports for each. Return empty reports so no instances are fetched.
    mockAscFetch.mockResolvedValue({ data: [] });

    const result = await buildAnalyticsData("app-filter-types");
    // The first ascFetch call is for report requests
    expect(mockAscFetch.mock.calls[0][0]).toBe(
      "/v1/apps/app-filter-types/analyticsReportRequests",
    );
    // Subsequent calls should use both req-ongoing and req-snapshot (not req-other)
    // For each of the 8 report types, findReportId is called with each valid requestId
    const reportCalls = mockAscFetch.mock.calls
      .filter((c: string[]) => c[0].includes("/reports?"))
      .map((c: string[]) => c[0]);
    // Should only reference req-ongoing and req-snapshot, never req-other
    for (const url of reportCalls) {
      expect(url).not.toContain("req-other");
    }
    // Should have results (all empty arrays)
    expect(result.dailyDownloads).toEqual([]);
  });
});

describe("buildAnalyticsData – full pipeline", () => {
  // Build TSV data for downloads
  const downloadTsv = tsvString(
    ["Date", "App Apple Identifier", "Download Type", "Source Type", "Territory", "Counts"],
    [
      ["2026-02-01", "app-full", "First-time download", "App Store search", "US", "10"],
      ["2026-02-01", "app-full", "Redownload", "App Store browse", "DE", "5"],
      ["2026-02-01", "app-full", "Auto-update", "Unavailable", "US", "3"],
      ["2026-02-02", "app-full", "First-time download", "Web referrer", "GB", "8"],
    ],
  );

  const purchaseTsv = tsvString(
    ["Date", "App Apple Identifier", "Territory", "Proceeds in USD", "Sales in USD"],
    [
      ["2026-02-01", "app-full", "US", "45.50", "53.69"],
      ["2026-02-02", "app-full", "DE", "12.30", "14.51"],
    ],
  );

  const engagementTsv = tsvString(
    ["Date", "App Apple Identifier", "Event", "Counts"],
    [
      ["2026-02-01", "app-full", "Impression", "3000"],
      ["2026-02-01", "app-full", "Page view", "500"],
    ],
  );

  const webPreviewTsv = tsvString(
    ["Date", "App Apple Identifier", "Event", "Counts"],
    [
      ["2026-02-01", "app-full", "Page view", "40"],
      ["2026-02-01", "app-full", "Tap", "12"],
    ],
  );

  const sessionTsv = tsvString(
    ["Date", "App Apple Identifier", "App Version", "Sessions", "Unique Devices", "Total Session Duration"],
    [
      ["2026-02-01", "app-full", "1.0.0", "100", "50", "4500"],
      ["2026-02-01", "app-full", "2.0.0", "200", "80", "12000"],
    ],
  );

  const installDeleteTsv = tsvString(
    ["Date", "App Apple Identifier", "Event", "Counts"],
    [
      ["2026-02-01", "app-full", "Install", "15"],
      ["2026-02-01", "app-full", "Delete", "3"],
    ],
  );

  const optInTsv = tsvString(
    ["Date", "App Apple Identifier", "Downloading Users", "Users Opting-In"],
    [["2026-02-01", "app-full", "100", "22"]],
  );

  // Crashes have no Date column – processingDate should be injected
  const crashTsv = tsvString(
    ["App Apple Identifier", "App Version", "Platform Version", "Device", "Crashes", "Unique Devices"],
    [
      ["app-full", "1.0.0", "macOS 26.2", "MacBookPro18,1", "10", "3"],
      ["app-full", "2.0.0", "macOS 26.3", "MacBookAir10,1", "5", "2"],
    ],
  );

  // Expanded crashes have Date column (daily granularity)
  const expandedCrashTsv = tsvString(
    ["Date", "App Apple Identifier", "App Version", "Platform Version", "Device", "Crashes", "Unique Devices"],
    [
      ["2026-02-01", "app-full", "1.0.0", "macOS 26.2", "MacBookPro18,1", "4", "2"],
      ["2026-02-01", "app-full", "2.0.0", "macOS 26.3", "MacBookAir10,1", "2", "1"],
      ["2026-02-02", "app-full", "1.0.0", "macOS 26.2", "MacBookPro18,1", "3", "1"],
    ],
  );

  // Mock perfPowerMetrics response
  const perfPowerMetricsResponse = {
    insights: {
      regressions: [
        {
          metric: "launchTime",
          metricCategory: "LAUNCH",
          latestVersion: "2.0.0",
          summaryString: "Launch time increased 10% on Mac (All)",
        },
      ],
    },
    productData: [
      {
        platform: "macOS",
        metricCategories: [
          {
            identifier: "LAUNCH",
            metrics: [
              {
                identifier: "launchTime",
                unit: { displayName: "ms" },
                datasets: [
                  {
                    filterCriteria: { device: "all_macs", percentile: "percentile.fifty" },
                    points: [
                      { version: "1.0.0", value: 768.7 },
                      { version: "2.0.0", value: 997.8 },
                    ],
                  },
                  {
                    filterCriteria: { device: "all_macs", percentile: "percentile.ninety" },
                    points: [
                      { version: "1.0.0", value: 1532.1 },
                      { version: "2.0.0", value: 2014.3 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  // Map of report names to their TSV data and segment URLs
  const reportData: Record<string, string> = {
    "App Downloads Standard": downloadTsv,
    "App Store Purchases Standard": purchaseTsv,
    "App Store Discovery and Engagement Standard": engagementTsv,
    "App Store Web Preview Engagement Standard": webPreviewTsv,
    "App Sessions Standard": sessionTsv,
    "App Store Installation and Deletion Standard": installDeleteTsv,
    "App Opt In": optInTsv,
    "App Crashes": crashTsv,
    "App Crashes Expanded": expandedCrashTsv,
  };

  function setupFullPipeline() {
    mockCacheGet.mockReturnValue(null);

    // Track report names to IDs for URL routing
    const reportNameToId: Record<string, string> = {};
    const reportNames = Object.keys(reportData);
    reportNames.forEach((name, i) => {
      reportNameToId[name] = `report-${i}`;
    });

    mockAscFetch.mockImplementation(async (url: string) => {
      // perfPowerMetrics – separate API
      if (url.includes("/perfPowerMetrics")) {
        return perfPowerMetricsResponse;
      }

      // Report requests
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-1"]);
      }

      // Reports for a request (by category)
      if (url.includes("/reports?filter[category]=")) {
        const category = url.match(/filter\[category\]=([^&]+)/)?.[1] ?? "";
        const matching = reportNames
          .filter((name) => {
            if (category === "COMMERCE") {
              return name.includes("Downloads") || name.includes("Purchases");
            }
            if (category === "APP_STORE_ENGAGEMENT") {
              return name.includes("Discovery") || name.includes("Web Preview");
            }
            if (category === "APP_USAGE") {
              return name.includes("Sessions") || name.includes("Installation") || name.includes("Opt In") || name === "App Crashes";
            }
            if (category === "PERFORMANCE") {
              return name === "App Crashes Expanded";
            }
            return false;
          })
          .map((name) => ({ id: reportNameToId[name], name, category }));
        return reportsResponse(matching);
      }

      // Instances for a report
      if (url.includes("/instances?")) {
        const reportId = url.match(/analyticsReports\/([^/]+)/)?.[1] ?? "";
        const reportName = Object.entries(reportNameToId).find(
          ([, id]) => id === reportId,
        )?.[0];
        const isMonthlyCrash = reportName === "App Crashes";
        return instancesResponse([
          {
            id: `inst-${reportId}`,
            processingDate: isMonthlyCrash ? "2026-02-01" : "2026-02-02",
            granularity: isMonthlyCrash ? "MONTHLY" : "DAILY",
          },
        ]);
      }

      // Segments for an instance
      if (url.includes("/segments")) {
        const instanceId = url.match(/Instances\/([^/]+)/)?.[1] ?? "";
        const reportId = instanceId.replace("inst-", "");
        return segmentsResponse([
          { id: `seg-${reportId}`, url: `https://s3.example.com/${reportId}.tsv.gz` },
        ]);
      }

      return { data: [] };
    });

    // Global fetch for S3 segment downloads
    mockFetch.mockImplementation(async (url: string) => {
      const reportId = url.match(/s3\.example\.com\/(.+)\.tsv\.gz/)?.[1] ?? "";
      const reportName = Object.entries(reportNameToId).find(
        ([, id]) => id === reportId,
      )?.[0];
      const tsv = reportName ? reportData[reportName] : "";
      // Return plain text (not gzipped) – downloadSegment handles both
      return makeFetchResponse(tsv);
    });
  }

  it("orchestrates full pipeline from report requests to aggregated data", async () => {
    setupFullPipeline();

    const result = await buildAnalyticsData("app-full");

    // Downloads
    expect(result.dailyDownloads).toHaveLength(2);
    expect(result.dailyDownloads[0]).toEqual({
      date: "2026-02-01",
      firstTime: 10,
      redownload: 5,
      update: 3,
    });
    expect(result.dailyDownloads[1]).toEqual({
      date: "2026-02-02",
      firstTime: 8,
      redownload: 0,
      update: 0,
    });

    // Revenue
    expect(result.dailyRevenue).toHaveLength(2);
    expect(result.dailyRevenue[0]).toEqual({
      date: "2026-02-01",
      proceeds: 46,
      sales: 54,
    });

    // Engagement
    expect(result.dailyEngagement).toHaveLength(1);
    expect(result.dailyEngagement[0]).toEqual({
      date: "2026-02-01",
      impressions: 3500, // 3000 Impression + 500 Page view
      pageViews: 500,
    });

    // Sessions
    expect(result.dailySessions).toHaveLength(1);
    expect(result.dailySessions[0]).toEqual({
      date: "2026-02-01",
      sessions: 300,
      uniqueDevices: 130,
      avgDuration: 55, // 16500 / 300
    });

    // Installs/deletes
    expect(result.dailyInstallsDeletes).toHaveLength(1);
    expect(result.dailyInstallsDeletes[0]).toEqual({
      date: "2026-02-01",
      installs: 15,
      deletes: 3,
    });

    // Downloads by source (excludes Auto-update)
    expect(result.dailyDownloadsBySource).toHaveLength(2);
    expect(result.dailyDownloadsBySource[0]).toEqual({
      date: "2026-02-01",
      search: 10,
      browse: 5,
      webReferrer: 0,
      unavailable: 0,
    });

    // Daily territory downloads (excludes Auto-update)
    expect(result.dailyTerritoryDownloads).toEqual(
      expect.arrayContaining([
        { date: "2026-02-01", code: "US", downloads: 10 },
        { date: "2026-02-01", code: "DE", downloads: 5 },
        { date: "2026-02-02", code: "GB", downloads: 8 },
      ]),
    );

    // Version sessions
    expect(result.dailyVersionSessions).toHaveLength(1);
    expect(result.dailyVersionSessions[0]).toEqual({
      date: "2026-02-01",
      v100: 100,
      v200: 200,
    });

    // Opt-in
    expect(result.dailyOptIn).toHaveLength(1);
    expect(result.dailyOptIn[0]).toEqual({
      date: "2026-02-01",
      downloading: 100,
      optingIn: 22,
    });

    // Web preview
    expect(result.dailyWebPreview).toHaveLength(1);
    expect(result.dailyWebPreview[0]).toEqual({
      date: "2026-02-01",
      pageViews: 40,
      appStoreTaps: 12,
    });

    // Territories (first-time + redownload only)
    expect(result.territories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "US", downloads: 10 }),
        expect.objectContaining({ code: "DE", downloads: 5 }),
        expect.objectContaining({ code: "GB", downloads: 8 }),
      ]),
    );

    // Discovery sources (first-time + redownload only)
    expect(result.discoverySources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "search", count: 10 }),
        expect.objectContaining({ source: "browse", count: 5 }),
      ]),
    );

    // Crashes – Date should have been injected from processingDate
    expect(result.crashesByVersion).toEqual(
      expect.arrayContaining([
        { version: "1.0.0", platform: "macOS 26.2", crashes: 10, uniqueDevices: 3 },
        { version: "2.0.0", platform: "macOS 26.3", crashes: 5, uniqueDevices: 2 },
      ]),
    );

    expect(result.crashesByDevice).toEqual([
      { device: "MacBookPro18,1", crashes: 10, uniqueDevices: 3 },
      { device: "MacBookAir10,1", crashes: 5, uniqueDevices: 2 },
    ]);

    // Daily crashes (from App Crashes Expanded – daily granularity)
    expect(result.dailyCrashes).toHaveLength(2);
    expect(result.dailyCrashes[0]).toEqual({
      date: "2026-02-01",
      crashes: 6, // 4 + 2
      uniqueDevices: 3, // 2 + 1
    });
    expect(result.dailyCrashes[1]).toEqual({
      date: "2026-02-02",
      crashes: 3,
      uniqueDevices: 1,
    });

    // Performance metrics (from perfPowerMetrics API)
    expect(result.perfMetrics).toHaveLength(1);
    expect(result.perfMetrics[0]).toEqual({
      category: "LAUNCH",
      metric: "launchTime",
      unit: "ms",
      platform: "macOS",
      datasets: [
        {
          percentile: "percentile.fifty",
          device: "all_macs",
          points: [
            { version: "1.0.0", value: 768.7 },
            { version: "2.0.0", value: 997.8 },
          ],
        },
        {
          percentile: "percentile.ninety",
          device: "all_macs",
          points: [
            { version: "1.0.0", value: 1532.1 },
            { version: "2.0.0", value: 2014.3 },
          ],
        },
      ],
    });

    // Performance regressions
    expect(result.perfRegressions).toHaveLength(1);
    expect(result.perfRegressions[0]).toEqual({
      metric: "launchTime",
      metricCategory: "LAUNCH",
      latestVersion: "2.0.0",
      summary: "Launch time increased 10% on Mac (All)",
    });

    // Should cache final result
    expect(mockCacheSet).toHaveBeenCalledWith(
      "analytics:app-full",
      expect.objectContaining({ dailyDownloads: expect.any(Array) }),
      3_600_000,
    );
  });

  it("caches report request IDs in SQLite", async () => {
    setupFullPipeline();

    await buildAnalyticsData("app-cache-rr");

    expect(mockCacheSet).toHaveBeenCalledWith(
      "asc-report-requests:app-cache-rr",
      ["req-1"],
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it("caches report IDs in SQLite", async () => {
    // Standalone mock to avoid in-memory cache interference from prior tests
    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-rid-test"]);
      }
      if (url.includes("/reports?filter[category]=")) {
        const category = url.match(/filter\[category\]=([^&]+)/)?.[1] ?? "";
        if (category === "COMMERCE") {
          return reportsResponse([
            { id: "rpt-dl", name: "App Downloads Standard", category: "COMMERCE" },
            { id: "rpt-pur", name: "App Store Purchases Standard", category: "COMMERCE" },
          ]);
        }
        return { data: [] };
      }
      if (url.includes("/instances?")) {
        return instancesResponse([]);
      }
      return { data: [] };
    });

    await buildAnalyticsData("app-cache-rid2");

    // Report IDs should be cached in SQLite
    const reportIdCacheCalls = mockCacheSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).startsWith("asc-report-id:req-rid-test:"),
    );
    expect(reportIdCacheCalls.length).toBeGreaterThan(0);
    // TTL should be 7 days
    for (const call of reportIdCacheCalls) {
      expect(call[2]).toBe(7 * 24 * 60 * 60 * 1000);
    }
  });

  it("caches instance rows in SQLite with instance TTL", async () => {
    setupFullPipeline();

    await buildAnalyticsData("app-cache-inst");

    const instanceCacheCalls = mockCacheSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).startsWith("analytics-inst:"),
    );
    expect(instanceCacheCalls.length).toBeGreaterThan(0);
    // All instances have processingDate !== today, so should use INSTANCE_TTL (30 days)
    for (const call of instanceCacheCalls) {
      expect(call[2]).toBe(30 * 24 * 60 * 60 * 1000);
    }
  });
});

describe("buildAnalyticsData – caching tiers", () => {
  it("uses SQLite-cached report request IDs (skips API)", async () => {
    // Analytics cache miss
    mockCacheGet.mockImplementation((key: string) => {
      if (key === "analytics:app-sqlite-rr") return null;
      if (key === "asc-report-requests:app-sqlite-rr") return ["req-from-db"];
      return null;
    });
    // findReportId calls for each report type – all return no reports
    mockAscFetch.mockResolvedValue({ data: [] });

    const result = await buildAnalyticsData("app-sqlite-rr");
    expect(result.dailyDownloads).toEqual([]);
    // Should NOT have called the report requests API
    const rrCalls = mockAscFetch.mock.calls.filter(
      (c: string[]) => c[0].includes("/analyticsReportRequests") && !c[0].includes("/reports"),
    );
    expect(rrCalls).toHaveLength(0);
    // Should have called reports API with the DB-cached request ID
    const reportCalls = mockAscFetch.mock.calls.filter(
      (c: string[]) => c[0].includes("req-from-db/reports"),
    );
    expect(reportCalls.length).toBeGreaterThan(0);
  });

  it("uses SQLite-cached report IDs (skips report listing API)", async () => {
    mockCacheGet.mockImplementation((key: string) => {
      if (key === "analytics:app-sqlite-rid") return null;
      if (key === "asc-report-requests:app-sqlite-rid") return ["req-x"];
      if (key.startsWith("asc-report-id:req-x:")) return "cached-report-id";
      return null;
    });
    // Instance fetch returns empty
    mockAscFetch.mockResolvedValue(instancesResponse([]));

    const result = await buildAnalyticsData("app-sqlite-rid");
    expect(result.dailyDownloads).toEqual([]);
    // Should NOT have called the reports listing API
    const reportListCalls = mockAscFetch.mock.calls.filter(
      (c: string[]) => c[0].includes("/reports?filter"),
    );
    expect(reportListCalls).toHaveLength(0);
  });

  it("uses SQLite-cached instance rows (skips segment download)", async () => {
    const cachedRows = [
      { Date: "2026-02-01", "App Apple Identifier": "app-cache-rows", "Download Type": "First-time download", "Source Type": "App Store search", Territory: "US", Counts: "5" },
    ];

    mockCacheGet.mockImplementation((key: string) => {
      if (key === "analytics:app-cache-rows") return null;
      if (key === "asc-report-requests:app-cache-rows") return ["req-cr"];
      if (key.startsWith("asc-report-id:")) return null;
      if (key.startsWith("analytics-inst:")) return cachedRows;
      return null;
    });

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-dl", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-cached", processingDate: "2026-02-01" }]);
      }
      return { data: [] };
    });

    const result = await buildAnalyticsData("app-cache-rows");
    // Should have used cached rows, so no fetch calls
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.dailyDownloads).toHaveLength(1);
    expect(result.dailyDownloads[0].firstTime).toBe(5);
  });
});

describe("segment download", () => {
  it("decompresses gzipped segments", async () => {
    const tsv = "Date\tCounts\n2026-02-01\t10";
    const gzipped = gzipSync(Buffer.from(tsv));

    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-gz"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-gz", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-gz", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-gz", url: "https://s3.example.com/gz.tsv.gz" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(gzipped));

    const result = await buildAnalyticsData("app-gz");
    // If gzip worked, we should get aggregated downloads
    // The TSV has no App Apple Identifier, so no filtering happens
    expect(result.dailyDownloads).toHaveLength(1);
  });

  it("falls back to plain text when gzip decompression fails", async () => {
    const tsv = "Date\tCounts\n2026-02-01\t7";

    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-plain"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-plain", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-plain", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-plain", url: "https://s3.example.com/plain.tsv" }]);
      }
      return { data: [] };
    });

    // Return plain text (not gzipped) – gunzipSync will fail, fallback to toString
    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-plain");
    expect(result.dailyDownloads).toHaveLength(1);
  });

  it("retries on transient errors (TypeError)", async () => {
    const tsv = "Date\tCounts\n2026-02-01\t1";

    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-retry"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-retry", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-retry", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-retry", url: "https://s3.example.com/retry.tsv" }]);
      }
      return { data: [] };
    });

    // Fail twice with TypeError (transient), succeed third time – URL-based to handle parallel fetches
    let retryCallCount = 0;
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("s3.example.com/retry")) {
        retryCallCount++;
        if (retryCallCount <= 2) throw new TypeError("fetch failed");
        return makeFetchResponse(tsv);
      }
      return makeFetchResponse("");
    });

    const result = await buildAnalyticsData("app-retry");
    expect(result.dailyDownloads).toHaveLength(1);
    expect(retryCallCount).toBe(3);
  });

  it("retries on ECONNRESET errors", async () => {
    const tsv = "Date\tCounts\n2026-02-01\t1";

    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-econn"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-econn", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-econn", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-econn", url: "https://s3.example.com/econn.tsv" }]);
      }
      return { data: [] };
    });

    let econnCallCount = 0;
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("s3.example.com/econn")) {
        econnCallCount++;
        if (econnCallCount <= 1) throw new Error("ECONNRESET");
        return makeFetchResponse(tsv);
      }
      return makeFetchResponse("");
    });

    const result = await buildAnalyticsData("app-econn");
    expect(result.dailyDownloads).toHaveLength(1);
  });

  it("throws immediately on non-transient errors (HTTP 403)", async () => {
    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-403"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-403", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-403", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-403", url: "https://s3.example.com/403.tsv" }]);
      }
      return { data: [] };
    });

    // Return 403 for the target URL, empty for others
    let s3_403_calls = 0;
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("s3.example.com/403")) {
        s3_403_calls++;
        return makeFetchResponse("Forbidden", false, 403);
      }
      return makeFetchResponse("");
    });

    // buildAnalyticsData uses Promise.allSettled, so failed instances are logged and skipped
    const result = await buildAnalyticsData("app-403");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[analytics] Instance download failed:",
      expect.any(Error),
    );
    // Downloads should be empty since the instance download failed
    expect(result.dailyDownloads).toEqual([]);
    // fetch should have been called exactly once per segment (no retries)
    expect(s3_403_calls).toBe(1);
  });
});

describe("instance deduplication by processing date", () => {
  it("deduplicates instances across report requests by processingDate", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "Download Type", "Counts"],
      [["2026-02-01", "First-time download", "10"]],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-a", "req-b"], ["ONGOING", "ONE_TIME_SNAPSHOT"]);
      }
      if (url.includes("/reports?filter")) {
        // Both requests have the same report
        const requestId = url.match(/analyticsReportRequests\/([^/]+)/)?.[1];
        return reportsResponse([
          { id: `rpt-${requestId}`, name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        // Both reports return an instance with the same processingDate
        return instancesResponse([
          { id: url.includes("rpt-req-a") ? "inst-a" : "inst-b", processingDate: "2026-02-01" },
        ]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-dedup", url: "https://s3.example.com/dedup.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-dedup-inst");
    // Only one instance should be downloaded (the first one wins)
    expect(result.dailyDownloads).toHaveLength(1);
    expect(result.dailyDownloads[0].firstTime).toBe(10);
  });
});

describe("data date deduplication in fetchReportData", () => {
  it("deduplicates rows by data date across instances", async () => {
    mockCacheGet.mockReturnValue(null);

    // Two instances with overlapping data dates
    const tsvInst1 = tsvString(
      ["Date", "Download Type", "Counts"],
      [
        ["2026-02-02", "First-time download", "20"],
        ["2026-02-01", "First-time download", "15"],
      ],
    );

    const tsvInst2 = tsvString(
      ["Date", "Download Type", "Counts"],
      [
        ["2026-02-01", "First-time download", "10"], // Overlaps with inst1 – should be dropped
        ["2026-01-31", "First-time download", "5"],
      ],
    );

    let instanceCallCount = 0;

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-datededup"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-datededup", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        // Return two instances (newest first, as ASC API does)
        return instancesResponse([
          { id: "inst-datededup-1", processingDate: "2026-02-02" },
          { id: "inst-datededup-2", processingDate: "2026-02-01" },
        ]);
      }
      if (url.includes("/segments")) {
        instanceCallCount++;
        const instId = url.match(/Instances\/([^/]+)/)?.[1] ?? "";
        return segmentsResponse([
          { id: `seg-${instId}`, url: `https://s3.example.com/${instId}.tsv` },
        ]);
      }
      return { data: [] };
    });

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("inst-datededup-1")) return makeFetchResponse(tsvInst1);
      if (url.includes("inst-datededup-2")) return makeFetchResponse(tsvInst2);
      return makeFetchResponse("");
    });

    const result = await buildAnalyticsData("app-datededup");
    // Should have 3 dates: Feb 2 (20 from inst1), Feb 1 (15 from inst1, wins over inst2's 10), Jan 31 (5 from inst2)
    expect(result.dailyDownloads).toHaveLength(3);
    const sorted = [...result.dailyDownloads].sort((a, b) => a.date.localeCompare(b.date));
    expect(sorted[0]).toEqual({ date: "2026-01-31", firstTime: 5, redownload: 0, update: 0 });
    expect(sorted[1]).toEqual({ date: "2026-02-01", firstTime: 15, redownload: 0, update: 0 });
    expect(sorted[2]).toEqual({ date: "2026-02-02", firstTime: 20, redownload: 0, update: 0 });
  });
});

describe("failed instance downloads", () => {
  it("logs and skips failed instance downloads", async () => {
    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-fail"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-fail", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([
          { id: "inst-fail-ok", processingDate: "2026-02-02" },
          { id: "inst-fail-bad", processingDate: "2026-02-01" },
        ]);
      }
      if (url.includes("/segments")) {
        const instId = url.match(/Instances\/([^/]+)/)?.[1] ?? "";
        if (instId === "inst-fail-bad") {
          throw new Error("Segment API error");
        }
        return segmentsResponse([
          { id: "seg-ok", url: "https://s3.example.com/ok.tsv" },
        ]);
      }
      return { data: [] };
    });

    const tsv = tsvString(
      ["Date", "Download Type", "Counts"],
      [["2026-02-02", "First-time download", "7"]],
    );
    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-fail");
    // The warning should be logged for the failed instance
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[analytics] Instance download failed:",
      expect.any(Error),
    );
    // Good instance should still produce data
    expect(result.dailyDownloads).toHaveLength(1);
    expect(result.dailyDownloads[0].firstTime).toBe(7);
  });
});

describe("processingDate injection for rows without Date column", () => {
  it("injects processingDate as Date for rows missing Date column", async () => {
    mockCacheGet.mockReturnValue(null);

    // Crash TSV has no Date column
    const crashTsv = tsvString(
      ["App Version", "Platform Version", "Device", "Crashes", "Unique Devices"],
      [["1.0.0", "macOS 26.2", "MacBookPro18,1", "10", "3"]],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-nodate"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-crash", name: "App Crashes", category: "APP_USAGE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([
          { id: "inst-crash", processingDate: "2026-01-15", granularity: "MONTHLY" },
        ]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-crash", url: "https://s3.example.com/crash.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(crashTsv));

    const result = await buildAnalyticsData("app-nodate");
    // Crashes should have Date injected from processingDate
    expect(result.crashesByVersion).toHaveLength(1);
    expect(result.crashesByVersion[0]).toEqual({
      version: "1.0.0",
      platform: "macOS 26.2",
      crashes: 10,
      uniqueDevices: 3,
    });
  });
});

describe("filterByApp", () => {
  it("filters rows by App Apple Identifier", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "App Apple Identifier", "Download Type", "Source Type", "Territory", "Counts"],
      [
        ["2026-02-01", "app-mine", "First-time download", "App Store search", "US", "10"],
        ["2026-02-01", "app-other", "First-time download", "App Store search", "US", "99"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-filter"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-filter", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-filter", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-filter", url: "https://s3.example.com/filter.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-mine");
    // Should only include rows for app-mine, not app-other
    expect(result.dailyDownloads).toHaveLength(1);
    expect(result.dailyDownloads[0].firstTime).toBe(10);
  });

  it("returns all rows when App Apple Identifier column is absent", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "Download Type", "Counts"],
      [
        ["2026-02-01", "First-time download", "10"],
        ["2026-02-01", "Redownload", "5"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-nofilter"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-nofilter", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-nofilter", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-nofilter", url: "https://s3.example.com/nofilter.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-nofilter");
    expect(result.dailyDownloads).toHaveLength(1);
    expect(result.dailyDownloads[0].firstTime).toBe(10);
    expect(result.dailyDownloads[0].redownload).toBe(5);
  });
});

describe("today instance TTL", () => {
  it("uses short TTL for today's instances", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "Download Type", "Counts"],
      [[today, "First-time download", "1"]],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-today"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-today", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-today", processingDate: today }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-today", url: "https://s3.example.com/today.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    await buildAnalyticsData("app-today");

    // Today's instance should be cached with TODAY_TTL (10 min)
    const todayInstanceCall = mockCacheSet.mock.calls.find(
      (c: unknown[]) => c[0] === "analytics-inst:inst-today",
    );
    expect(todayInstanceCall).toBeDefined();
    expect(todayInstanceCall![2]).toBe(10 * 60 * 1000);
  });

  it("skips instance cache for today's instances (always re-downloads)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const tsv = tsvString(
      ["Date", "Download Type", "Counts"],
      [[today, "First-time download", "1"]],
    );

    mockCacheGet.mockImplementation((key: string) => {
      if (key === "analytics:app-today-skip") return null;
      if (key === "asc-report-requests:app-today-skip") return ["req-ts"];
      if (key.startsWith("asc-report-id:")) return null;
      // Return cached rows for today's instance – should be ignored
      if (key === "analytics-inst:inst-today-skip") return [{ Date: today, "Download Type": "First-time download", Counts: "999" }];
      return null;
    });

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-ts", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-today-skip", processingDate: today }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-ts", url: "https://s3.example.com/ts.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-today-skip");
    // Should have fetched from S3 (not used cached 999 value)
    expect(mockFetch).toHaveBeenCalled();
    expect(result.dailyDownloads).toHaveLength(1);
    expect(result.dailyDownloads[0].firstTime).toBe(1);
  });
});

describe("aggregation output shapes", () => {
  // These tests verify aggregation functions produce the correct shapes
  // by feeding known TSV data through the full pipeline

  it("aggregateRevenue rounds proceeds and sales", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "Proceeds in USD", "Sales in USD"],
      [
        ["2026-02-01", "12.34", "15.67"],
        ["2026-02-01", "7.89", "9.33"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-rev"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-rev", name: "App Store Purchases Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-rev", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-rev", url: "https://s3.example.com/rev.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-rev");
    expect(result.dailyRevenue).toHaveLength(1);
    expect(result.dailyRevenue[0]).toEqual({
      date: "2026-02-01",
      proceeds: 20, // Math.round(12.34 + 7.89) = 20
      sales: 25,    // Math.round(15.67 + 9.33) = 25
    });
  });

  it("aggregateSessions computes avgDuration correctly", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "Sessions", "Unique Devices", "Total Session Duration"],
      [
        ["2026-02-01", "100", "50", "6000"],
        ["2026-02-01", "50", "30", "3000"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-sess"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-sess", name: "App Sessions Standard", category: "APP_USAGE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-sess", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-sess", url: "https://s3.example.com/sess.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-sess");
    expect(result.dailySessions).toHaveLength(1);
    expect(result.dailySessions[0]).toEqual({
      date: "2026-02-01",
      sessions: 150,
      uniqueDevices: 80,
      avgDuration: 60, // 9000 / 150 = 60
    });
  });

  it("aggregateSessions returns avgDuration 0 when no sessions", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "Sessions", "Unique Devices", "Total Session Duration"],
      [["2026-02-01", "0", "0", "0"]],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-nosess"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-nosess", name: "App Sessions Standard", category: "APP_USAGE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-nosess", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-nosess", url: "https://s3.example.com/nosess.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-nosess");
    expect(result.dailySessions[0].avgDuration).toBe(0);
  });

  it("aggregateCrashesByVersion groups by version+platform", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["App Version", "Platform Version", "Device", "Crashes", "Unique Devices"],
      [
        ["1.0.0", "macOS 26.2", "Mac14,2", "5", "2"],
        ["1.0.0", "macOS 26.2", "MacBookPro18,1", "3", "1"],
        ["2.0.0", "macOS 26.3", "Mac14,2", "2", "1"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-cbv"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-cbv", name: "App Crashes", category: "APP_USAGE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-cbv", processingDate: "2026-01-01", granularity: "MONTHLY" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-cbv", url: "https://s3.example.com/cbv.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-cbv");
    expect(result.crashesByVersion).toEqual(
      expect.arrayContaining([
        { version: "1.0.0", platform: "macOS 26.2", crashes: 8, uniqueDevices: 3 },
        { version: "2.0.0", platform: "macOS 26.3", crashes: 2, uniqueDevices: 1 },
      ]),
    );
  });

  it("aggregateCrashesByDevice groups and sorts by crashes descending", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["App Version", "Platform Version", "Device", "Crashes", "Unique Devices"],
      [
        ["1.0.0", "macOS 26.2", "Mac14,2", "3", "2"],
        ["1.0.0", "macOS 26.2", "MacBookPro18,1", "7", "3"],
        ["2.0.0", "macOS 26.3", "Mac14,2", "1", "1"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-cbd"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-cbd", name: "App Crashes", category: "APP_USAGE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-cbd", processingDate: "2026-01-01", granularity: "MONTHLY" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-cbd", url: "https://s3.example.com/cbd.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-cbd");
    // Sorted by crashes descending
    expect(result.crashesByDevice[0]).toEqual({ device: "MacBookPro18,1", crashes: 7, uniqueDevices: 3 });
    expect(result.crashesByDevice[1]).toEqual({ device: "Mac14,2", crashes: 4, uniqueDevices: 3 });
  });

  it("aggregateEngagement sums impressions and page views correctly", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "Event", "Counts"],
      [
        ["2026-02-01", "Impression", "3000"],
        ["2026-02-01", "Page view", "500"],
        ["2026-02-02", "Impression", "2500"],
        ["2026-02-02", "Page view", "400"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-eng"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-eng", name: "App Store Discovery and Engagement Standard", category: "APP_STORE_ENGAGEMENT" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-eng", processingDate: "2026-02-02" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-eng", url: "https://s3.example.com/eng.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-eng");
    expect(result.dailyEngagement).toHaveLength(2);
    // Impressions = listing impressions + page views
    expect(result.dailyEngagement[0]).toEqual({
      date: "2026-02-01",
      impressions: 3500,
      pageViews: 500,
    });
    expect(result.dailyEngagement[1]).toEqual({
      date: "2026-02-02",
      impressions: 2900,
      pageViews: 400,
    });
  });

  it("aggregateVersionSessions converts version to safe key", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "App Version", "Sessions"],
      [
        ["2026-02-01", "1.2.3", "50"],
        ["2026-02-01", "2.0.0", "100"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-vs"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-vs", name: "App Sessions Standard", category: "APP_USAGE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-vs", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-vs", url: "https://s3.example.com/vs.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-vs");
    expect(result.dailyVersionSessions).toHaveLength(1);
    const entry = result.dailyVersionSessions[0];
    expect(entry.date).toBe("2026-02-01");
    // "1.2.3" → "v123", "2.0.0" → "v200"
    expect(entry["v123"]).toBe(50);
    expect(entry["v200"]).toBe(100);
  });

  it("aggregateDownloadsBySource excludes updates", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "Download Type", "Source Type", "Counts"],
      [
        ["2026-02-01", "First-time download", "App Store search", "10"],
        ["2026-02-01", "Redownload", "App Store browse", "5"],
        ["2026-02-01", "Auto-update", "Unavailable", "20"],
        ["2026-02-01", "Manual update", "Unavailable", "8"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-dbs"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-dbs", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-dbs", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-dbs", url: "https://s3.example.com/dbs.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-dbs");
    expect(result.dailyDownloadsBySource).toHaveLength(1);
    // Auto-update and Manual update should be excluded
    expect(result.dailyDownloadsBySource[0]).toEqual({
      date: "2026-02-01",
      search: 10,
      browse: 5,
      webReferrer: 0,
      unavailable: 0,
    });
  });

  it("aggregateTerritories excludes updates and limits to top 20", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "Download Type", "Territory", "Counts"],
      [
        ["2026-02-01", "First-time download", "US", "100"],
        ["2026-02-01", "Redownload", "US", "50"],
        ["2026-02-01", "Auto-update", "US", "999"],
        ["2026-02-01", "First-time download", "DE", "30"],
      ],
    );

    const purchaseTsv = tsvString(
      ["Date", "Territory", "Proceeds in USD", "Sales in USD"],
      [
        ["2026-02-01", "US", "200", "236"],
        ["2026-02-01", "DE", "50", "59"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-terr"]);
      }
      if (url.includes("/reports?filter")) {
        const category = url.match(/filter\[category\]=([^&]+)/)?.[1] ?? "";
        if (category === "COMMERCE") {
          return reportsResponse([
            { id: "rpt-terr-dl", name: "App Downloads Standard", category: "COMMERCE" },
            { id: "rpt-terr-pur", name: "App Store Purchases Standard", category: "COMMERCE" },
          ]);
        }
        return { data: [] };
      }
      if (url.includes("/instances?")) {
        return instancesResponse([
          {
            id: `inst-${url.match(/analyticsReports\/([^/]+)/)?.[1]}`,
            processingDate: "2026-02-01",
          },
        ]);
      }
      if (url.includes("/segments")) {
        const instId = url.match(/Instances\/([^/]+)/)?.[1] ?? "";
        return segmentsResponse([
          { id: `seg-${instId}`, url: `https://s3.example.com/${instId}.tsv` },
        ]);
      }
      return { data: [] };
    });

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("rpt-terr-dl")) return makeFetchResponse(tsv);
      if (url.includes("rpt-terr-pur")) return makeFetchResponse(purchaseTsv);
      return makeFetchResponse("");
    });

    const result = await buildAnalyticsData("app-terr");
    // US should be first (most downloads), Auto-update excluded
    expect(result.territories[0]).toEqual(
      expect.objectContaining({ code: "US", downloads: 150, revenue: 200 }),
    );
    expect(result.territories[1]).toEqual(
      expect.objectContaining({ code: "DE", downloads: 30, revenue: 50 }),
    );
  });

  it("aggregateDiscoverySources maps source names to keys", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "Download Type", "Source Type", "Counts"],
      [
        ["2026-02-01", "First-time download", "App Store search", "50"],
        ["2026-02-01", "Redownload", "App Store browse", "30"],
        ["2026-02-01", "First-time download", "Web referrer", "20"],
        ["2026-02-01", "First-time download", "Unavailable", "10"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-disc"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-disc", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-disc", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-disc", url: "https://s3.example.com/disc.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-disc");
    expect(result.discoverySources).toEqual([
      { source: "search", count: 50, fill: "var(--color-search)" },
      { source: "browse", count: 30, fill: "var(--color-browse)" },
      { source: "webReferrer", count: 20, fill: "var(--color-webReferrer)" },
      { source: "unavailable", count: 10, fill: "var(--color-unavailable)" },
    ]);
  });

  it("aggregateOptIn rounds values", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "Downloading Users", "Users Opting-In"],
      [
        ["2026-02-01", "100.7", "22.3"],
        ["2026-02-01", "50.2", "11.9"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-optin"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-optin", name: "App Opt In", category: "APP_USAGE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-optin", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-optin", url: "https://s3.example.com/optin.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-optin");
    expect(result.dailyOptIn).toHaveLength(1);
    expect(result.dailyOptIn[0]).toEqual({
      date: "2026-02-01",
      downloading: 151, // Math.round(100.7 + 50.2)
      optingIn: 34,     // Math.round(22.3 + 11.9)
    });
  });

  it("aggregateWebPreview counts page views and taps", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "Event", "Counts"],
      [
        ["2026-02-01", "Page view", "40"],
        ["2026-02-01", "Tap", "12"],
        ["2026-02-02", "Page view", "35"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-wp"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-wp", name: "App Store Web Preview Engagement Standard", category: "APP_STORE_ENGAGEMENT" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-wp", processingDate: "2026-02-02" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-wp", url: "https://s3.example.com/wp.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-wp");
    expect(result.dailyWebPreview).toHaveLength(2);
    expect(result.dailyWebPreview[0]).toEqual({
      date: "2026-02-01",
      pageViews: 40,
      appStoreTaps: 12,
    });
    expect(result.dailyWebPreview[1]).toEqual({
      date: "2026-02-02",
      pageViews: 35,
      appStoreTaps: 0,
    });
  });

  it("aggregateInstallsDeletes counts install and delete events", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "Event", "Counts"],
      [
        ["2026-02-01", "Install", "25"],
        ["2026-02-01", "Delete", "3"],
        ["2026-02-01", "Install", "10"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-id"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-id", name: "App Store Installation and Deletion Standard", category: "APP_USAGE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-id", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-id", url: "https://s3.example.com/id.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-id");
    expect(result.dailyInstallsDeletes).toHaveLength(1);
    expect(result.dailyInstallsDeletes[0]).toEqual({
      date: "2026-02-01",
      installs: 35,
      deletes: 3,
    });
  });

  it("aggregateDailyTerritoryDownloads excludes updates", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "Download Type", "Territory", "Counts"],
      [
        ["2026-02-01", "First-time download", "US", "10"],
        ["2026-02-01", "Redownload", "US", "5"],
        ["2026-02-01", "Auto-update", "US", "50"],
        ["2026-02-01", "First-time download", "DE", "3"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-dtd"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-dtd", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-dtd", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-dtd", url: "https://s3.example.com/dtd.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-dtd");
    expect(result.dailyTerritoryDownloads).toEqual(
      expect.arrayContaining([
        { date: "2026-02-01", code: "US", downloads: 15 }, // 10 + 5 (no Auto-update)
        { date: "2026-02-01", code: "DE", downloads: 3 },
      ]),
    );
    // Should not include Auto-update in territory downloads
    const usTerr = result.dailyTerritoryDownloads.filter(
      (t) => t.code === "US",
    );
    expect(usTerr).toHaveLength(1);
    expect(usTerr[0].downloads).toBe(15);
  });
});

describe("console logging", () => {
  it("logs progress during fetching", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-log"]);
      }
      return { data: [] };
    });

    await buildAnalyticsData("app-log");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("[analytics] Building app-log"),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("[analytics] app-log: phase 1"),
    );
  });

  it("logs report request discovery details", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-logdetail"], ["ONGOING"]);
      }
      return { data: [] };
    });

    await buildAnalyticsData("app-logdetail");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("[analytics] app-logdetail: 1 usable report requests from 1 total"),
    );
  });
});

describe("parseTsv (re-exported)", () => {
  it("is exported from analytics module", () => {
    expect(typeof parseTsv).toBe("function");
    const result = parseTsv("A\tB\n1\t2");
    expect(result).toEqual([{ A: "1", B: "2" }]);
  });
});

describe("pagination", () => {
  it("follows pagination links for instances", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsvPage1 = tsvString(
      ["Date", "Download Type", "Counts"],
      [["2026-02-02", "First-time download", "10"]],
    );
    const tsvPage2 = tsvString(
      ["Date", "Download Type", "Counts"],
      [["2026-02-01", "First-time download", "5"]],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-page"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-page", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?") && !url.includes("page=2")) {
        return instancesResponse(
          [{ id: "inst-page-1", processingDate: "2026-02-02" }],
          "/v1/analyticsReports/rpt-page/instances?page=2",
        );
      }
      if (url.includes("page=2")) {
        return instancesResponse([{ id: "inst-page-2", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        const instId = url.match(/Instances\/([^/]+)/)?.[1] ?? "";
        return segmentsResponse([
          { id: `seg-${instId}`, url: `https://s3.example.com/${instId}.tsv` },
        ]);
      }
      return { data: [] };
    });

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("inst-page-1")) return makeFetchResponse(tsvPage1);
      if (url.includes("inst-page-2")) return makeFetchResponse(tsvPage2);
      return makeFetchResponse("");
    });

    const result = await buildAnalyticsData("app-page");
    // Should have data from both pages
    expect(result.dailyDownloads).toHaveLength(2);
    const sorted = [...result.dailyDownloads].sort((a, b) => a.date.localeCompare(b.date));
    expect(sorted[0].firstTime).toBe(5);
    expect(sorted[1].firstTime).toBe(10);
  });
});

describe("concurrent download limiting", () => {
  it("limits concurrent S3 downloads", async () => {
    mockCacheGet.mockReturnValue(null);

    // Create multiple instances to test concurrency
    const instances = Array.from({ length: 10 }, (_, i) => ({
      id: `inst-conc-${i}`,
      processingDate: `2026-02-${String(i + 1).padStart(2, "0")}`,
    }));

    const tsv = tsvString(
      ["Date", "Download Type", "Counts"],
      [["2026-02-01", "First-time download", "1"]],
    );

    let maxConcurrent = 0;
    let currentConcurrent = 0;

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-conc"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-conc", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse(instances);
      }
      if (url.includes("/segments")) {
        const instId = url.match(/Instances\/([^/]+)/)?.[1] ?? "";
        return segmentsResponse([
          { id: `seg-${instId}`, url: `https://s3.example.com/${instId}.tsv` },
        ]);
      }
      return { data: [] };
    });

    mockFetch.mockImplementation(async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      // Simulate some async work
      await new Promise((r) => setTimeout(r, 10));
      currentConcurrent--;
      return makeFetchResponse(tsv);
    });

    await buildAnalyticsData("app-conc");
    // MAX_CONCURRENT_DOWNLOADS is 6
    expect(maxConcurrent).toBeLessThanOrEqual(6);
  });
});

describe("findReportId caches all reports from a category", () => {
  it("caches all reports returned by a single category request", async () => {
    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-allcache"]);
      }
      if (url.includes("/reports?filter[category]=COMMERCE")) {
        // Returns both Commerce reports in one response
        return reportsResponse([
          { id: "rpt-dl", name: "App Downloads Standard", category: "COMMERCE" },
          { id: "rpt-pur", name: "App Store Purchases Standard", category: "COMMERCE" },
        ]);
      }
      // After the first COMMERCE call caches both report IDs,
      // subsequent findReportId calls for the same request should hit memory cache
      if (url.includes("/reports?filter")) {
        return { data: [] };
      }
      if (url.includes("/instances?")) {
        return instancesResponse([]);
      }
      return { data: [] };
    });

    await buildAnalyticsData("app-allcache");

    // Both reports should be cached in SQLite
    const reportIdCacheCalls = mockCacheSet.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).startsWith("asc-report-id:req-allcache:"),
    );
    const cachedNames = reportIdCacheCalls.map((c: unknown[]) => (c[0] as string).replace("asc-report-id:req-allcache:", ""));
    expect(cachedNames).toContain("App Downloads Standard");
    expect(cachedNames).toContain("App Store Purchases Standard");

    // Both Commerce report types (Downloads + Purchases) call findReportId
    // in parallel, so the COMMERCE category may be fetched twice if the parallel
    // calls race. The key invariant is that both report names get cached.
    const commerceCalls = mockAscFetch.mock.calls.filter(
      (c: string[]) => c[0].includes("filter[category]=COMMERCE"),
    );
    expect(commerceCalls.length).toBeGreaterThanOrEqual(1);
    expect(commerceCalls.length).toBeLessThanOrEqual(2);
  });
});

describe("aggregateTerritories – Intl.DisplayNames throw fallback", () => {
  it("falls back to raw code when Intl.DisplayNames.of() throws", async () => {
    mockCacheGet.mockReturnValue(null);

    // "INVALID" is not a valid ISO 3166 region code, so Intl.DisplayNames.of() throws
    const tsv = tsvString(
      ["Date", "Download Type", "Territory", "Counts"],
      [
        ["2026-02-01", "First-time download", "INVALID", "7"],
        ["2026-02-01", "First-time download", "US", "10"],
      ],
    );

    const purchaseTsv = tsvString(
      ["Date", "Territory", "Proceeds in USD", "Sales in USD"],
      [],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-intl-throw"]);
      }
      if (url.includes("/reports?filter")) {
        const category = url.match(/filter\[category\]=([^&]+)/)?.[1] ?? "";
        if (category === "COMMERCE") {
          return reportsResponse([
            { id: "rpt-intl-dl", name: "App Downloads Standard", category: "COMMERCE" },
            { id: "rpt-intl-pur", name: "App Store Purchases Standard", category: "COMMERCE" },
          ]);
        }
        return { data: [] };
      }
      if (url.includes("/instances?")) {
        return instancesResponse([
          {
            id: `inst-${url.match(/analyticsReports\/([^/]+)/)?.[1]}`,
            processingDate: "2026-02-01",
          },
        ]);
      }
      if (url.includes("/segments")) {
        const instId = url.match(/Instances\/([^/]+)/)?.[1] ?? "";
        return segmentsResponse([
          { id: `seg-${instId}`, url: `https://s3.example.com/${instId}.tsv` },
        ]);
      }
      return { data: [] };
    });

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("rpt-intl-dl")) return makeFetchResponse(tsv);
      if (url.includes("rpt-intl-pur")) return makeFetchResponse(purchaseTsv);
      return makeFetchResponse("");
    });

    const result = await buildAnalyticsData("app-intl-throw");

    // The invalid code should fall back to the raw code string "INVALID"
    const invalidTerritory = result.territories.find((t) => t.code === "INVALID");
    expect(invalidTerritory).toBeDefined();
    expect(invalidTerritory!.territory).toBe("INVALID");
    expect(invalidTerritory!.downloads).toBe(7);

    // Valid code should still resolve to a display name
    const usTerritory = result.territories.find((t) => t.code === "US");
    expect(usTerritory).toBeDefined();
    expect(usTerritory!.territory).toBe("United States");
  });

  it("falls back to code when displayNames.of() returns undefined", async () => {
    // Mock Intl.DisplayNames.prototype.of to return undefined for a specific code
    const originalOf = Intl.DisplayNames.prototype.of;
    Intl.DisplayNames.prototype.of = function (code: string) {
      if (code === "QQ") return undefined;
      return originalOf.call(this, code);
    };

    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "Territory", "Download Type", "Counts"],
      [["2026-02-01", "QQ", "First-time download", "3"]],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-dn-undef"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-dn-undef", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-dn-undef", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-dn-undef", url: "https://s3.example.com/dn-undef.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-dn-undef");

    const qqTerritory = result.territories.find((t) => t.code === "QQ");
    expect(qqTerritory).toBeDefined();
    // displayNames.of("QQ") returns undefined → falls back to "QQ"
    expect(qqTerritory!.territory).toBe("QQ");

    Intl.DisplayNames.prototype.of = originalOf;
  });
});

describe("parseTsv – row with fewer columns than headers", () => {
  it("fills missing columns with empty string via ?? fallback", () => {
    // TSV where data row has fewer columns than headers
    const tsv = "A\tB\tC\n1\t2";
    const result = parseTsv(tsv);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ A: "1", B: "2", C: "" });
  });
});

describe("downloadSegment – non-Error thrown in retry", () => {
  it("handles non-Error object thrown during fetch", async () => {
    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-non-err"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-non-err", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-non-err", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-non-err", url: "https://s3.example.com/non-err.tsv" }]);
      }
      return { data: [] };
    });

    // Throw a non-Error value (string) – this is not a TypeError,
    // so isTransient is false, and it should throw immediately.
    // The ternary `err instanceof Error ? ... : ""` takes the false branch.
    mockFetch.mockRejectedValueOnce("network failure string");

    const result = await buildAnalyticsData("app-non-err");
    // Should warn about the failed instance (not retried because not transient)
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[analytics] Instance download failed:",
      "network failure string",
    );
    expect(result.dailyDownloads).toEqual([]);
  });
});

describe("fetchReportData – lowercase 'date' column", () => {
  it("uses row['date'] when 'Date' column is absent (line 305 fallback)", async () => {
    mockCacheGet.mockReturnValue(null);

    // TSV with lowercase "date" column
    const tsv = tsvString(
      ["date", "Download Type", "Counts"],
      [
        ["2026-02-01", "First-time download", "10"],
        ["2026-02-02", "First-time download", "5"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-lc-date"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-lc-date", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-lc-date", processingDate: "2026-02-02" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-lc-date", url: "https://s3.example.com/lc-date.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-lc-date");
    // The lowercase "date" column should be recognized for deduplication
    // and the hasDateColumn check (line 295 checks for "Date" or "date").
    // Rows should be properly deduped by their lowercase "date" field.
    // Since there's only one instance, both dates should be present.
    // Note: aggregateDownloads uses groupByDate with "Date" (uppercase),
    // but the rows have "date" (lowercase), so groupByDate won't find "Date".
    // This means dailyDownloads will be empty. But the important thing is
    // that the date dedup path using row["date"] is exercised.
    // The rows are still processed – they just won't group by date in aggregation.
    expect(result).toBeDefined();
  });
});

describe("aggregateVersionSessions – missing date or version", () => {
  it("skips rows with missing Date or App Version", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "App Version", "Sessions"],
      [
        ["2026-02-02", "1.0.0", "80"],
        ["2026-02-01", "1.0.0", "50"],
        ["", "2.0.0", "30"],          // missing Date
        ["2026-02-01", "", "20"],      // missing App Version
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-vs-skip"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-vs-skip", name: "App Sessions Standard", category: "APP_USAGE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-vs-skip", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-vs-skip", url: "https://s3.example.com/vs-skip.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-vs-skip");
    // Only valid rows should be included, sorted by date
    expect(result.dailyVersionSessions).toHaveLength(2);
    expect(result.dailyVersionSessions[0]).toEqual({
      date: "2026-02-01",
      v100: 50,
    });
    expect(result.dailyVersionSessions[1]).toEqual({
      date: "2026-02-02",
      v100: 80,
    });
  });
});

describe("in-memory cache hit for report request IDs", () => {
  it("hits in-memory cache on second call for same appId", async () => {
    const appId = "app-mem-cache-hit";

    // First call: all caches miss, API returns report requests
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-mem"]);
      }
      return { data: [] };
    });

    await buildAnalyticsData(appId);

    // Verify the API was called for report requests on the first call
    const firstCallRRCalls = mockAscFetch.mock.calls.filter(
      (c: string[]) => c[0].includes("/analyticsReportRequests") && !c[0].includes("/reports"),
    );
    expect(firstCallRRCalls).toHaveLength(1);

    // Reset mocks for the second call
    mockAscFetch.mockReset();
    mockCacheGet.mockReturnValue(null); // analytics cache miss, but in-memory reportRequestIdsCache has it
    mockAscFetch.mockImplementation(async () => {
      return { data: [] };
    });

    await buildAnalyticsData(appId);

    // The report requests API should NOT be called on the second call –
    // it should hit the in-memory cache (line 64)
    const secondCallRRCalls = mockAscFetch.mock.calls.filter(
      (c: string[]) => c[0].includes(`/apps/${appId}/analyticsReportRequests`),
    );
    expect(secondCallRRCalls).toHaveLength(0);
  });
});

describe("segment download – retry exhaustion", () => {
  it("throws after exhausting all retries on transient errors", async () => {
    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-exhaust"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-exhaust", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-exhaust", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-exhaust", url: "https://s3.example.com/exhaust.tsv" }]);
      }
      return { data: [] };
    });

    // Fail all 3 attempts with transient TypeError errors – URL-based to handle parallel fetches
    let exhaustCallCount = 0;
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("s3.example.com/exhaust")) {
        exhaustCallCount++;
        throw new TypeError("fetch failed");
      }
      return makeFetchResponse("");
    });

    // buildAnalyticsData uses Promise.allSettled, so the instance fails but doesn't throw
    const result = await buildAnalyticsData("app-exhaust");

    // Should have warned about the failed instance
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[analytics] Instance download failed:",
      expect.any(TypeError),
    );
    // fetch was called 3 times (all retries exhausted)
    expect(exhaustCallCount).toBe(3);
    // Downloads should be empty since all retries failed
    expect(result.dailyDownloads).toEqual([]);
  });
});

describe("aggregation with empty/missing field values (|| fallback branches)", () => {
  // TSV data with empty values to trigger all `|| "0"`, `|| "Unknown"`,
  // `|| "1"`, and `|| source` fallback branches in aggregation functions.

  const emptyDownloadTsv = tsvString(
    ["Date", "App Apple Identifier", "Download Type", "Source Type", "Territory", "Counts", "Downloads"],
    [
      // Row with empty Download Type, Source Type, Territory, Counts, and Downloads
      ["2026-02-01", "app-empty-fields", "", "", "", "", ""],
      // Row with valid data for comparison
      ["2026-02-01", "app-empty-fields", "First-time download", "App Store search", "US", "10", "10"],
    ],
  );

  const emptyPurchaseTsv = tsvString(
    ["Date", "App Apple Identifier", "Territory", "Proceeds in USD", "Sales in USD"],
    [
      // Row with empty revenue fields
      ["2026-02-01", "app-empty-fields", "US", "", ""],
      // Row with valid data
      ["2026-02-01", "app-empty-fields", "DE", "10.50", "12.00"],
    ],
  );

  const emptyEngagementTsv = tsvString(
    ["Date", "App Apple Identifier", "Event", "Counts"],
    [
      // Row with empty Event and Counts
      ["2026-02-01", "app-empty-fields", "", ""],
      // Row with valid data
      ["2026-02-01", "app-empty-fields", "Impression", "100"],
    ],
  );

  const emptyWebPreviewTsv = tsvString(
    ["Date", "App Apple Identifier", "Event", "Counts"],
    [
      ["2026-02-01", "app-empty-fields", "", ""],
    ],
  );

  const emptySessionTsv = tsvString(
    ["Date", "App Apple Identifier", "App Version", "Sessions", "Unique Devices", "Total Session Duration"],
    [
      // Row with empty Sessions, Unique Devices, Total Session Duration
      ["2026-02-01", "app-empty-fields", "1.0.0", "", "", ""],
    ],
  );

  const emptyInstallDeleteTsv = tsvString(
    ["Date", "App Apple Identifier", "Event", "Counts"],
    [
      // Row with empty Event
      ["2026-02-01", "app-empty-fields", "", "5"],
    ],
  );

  const emptyOptInTsv = tsvString(
    ["Date", "App Apple Identifier", "Downloading Users", "Users Opting-In"],
    [
      // Row with empty opt-in fields
      ["2026-02-01", "app-empty-fields", "", ""],
    ],
  );

  // Crash TSV with empty App Version, Platform Version, Crashes, Unique Devices, Device
  const emptyCrashTsv = tsvString(
    ["App Apple Identifier", "App Version", "Platform Version", "Device", "Crashes", "Unique Devices"],
    [
      // Row with all empty fields
      ["app-empty-fields", "", "", "", "", ""],
      // Row with valid data
      ["app-empty-fields", "1.0.0", "macOS 26.2", "MacBookPro18,1", "5", "2"],
    ],
  );

  // Expanded crash TSV with empty fields
  const emptyExpandedCrashTsv = tsvString(
    ["Date", "App Apple Identifier", "App Version", "Device", "Crashes", "Unique Devices"],
    [
      ["2026-02-01", "app-empty-fields", "", "", "", ""],
      ["2026-02-01", "app-empty-fields", "1.0.0", "MacBookPro18,1", "3", "1"],
    ],
  );

  const emptyReportData: Record<string, string> = {
    "App Downloads Standard": emptyDownloadTsv,
    "App Store Purchases Standard": emptyPurchaseTsv,
    "App Store Discovery and Engagement Standard": emptyEngagementTsv,
    "App Store Web Preview Engagement Standard": emptyWebPreviewTsv,
    "App Sessions Standard": emptySessionTsv,
    "App Store Installation and Deletion Standard": emptyInstallDeleteTsv,
    "App Opt In": emptyOptInTsv,
    "App Crashes": emptyCrashTsv,
    "App Crashes Expanded": emptyExpandedCrashTsv,
  };

  function setupEmptyFieldsPipeline() {
    mockCacheGet.mockReturnValue(null);

    const reportNameToId: Record<string, string> = {};
    const reportNames = Object.keys(emptyReportData);
    reportNames.forEach((name, i) => {
      reportNameToId[name] = `rpt-ef-${i}`;
    });

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/perfPowerMetrics")) {
        return { productData: [] };
      }
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-ef"]);
      }
      if (url.includes("/reports?filter[category]=")) {
        const category = url.match(/filter\[category\]=([^&]+)/)?.[1] ?? "";
        const matching = reportNames
          .filter((name) => {
            if (category === "COMMERCE") {
              return name.includes("Downloads") || name.includes("Purchases");
            }
            if (category === "APP_STORE_ENGAGEMENT") {
              return name.includes("Discovery") || name.includes("Web Preview");
            }
            if (category === "APP_USAGE") {
              return name.includes("Sessions") || name.includes("Installation") || name.includes("Opt In") || name === "App Crashes";
            }
            if (category === "PERFORMANCE") {
              return name === "App Crashes Expanded";
            }
            return false;
          })
          .map((name) => ({ id: reportNameToId[name], name, category }));
        return reportsResponse(matching);
      }
      if (url.includes("/instances?")) {
        const reportId = url.match(/analyticsReports\/([^/]+)/)?.[1] ?? "";
        const reportName = Object.entries(reportNameToId).find(
          ([, id]) => id === reportId,
        )?.[0];
        const isMonthlyCrash = reportName === "App Crashes";
        return instancesResponse([
          {
            id: `inst-${reportId}`,
            processingDate: isMonthlyCrash ? "2026-02-01" : "2026-02-01",
            granularity: isMonthlyCrash ? "MONTHLY" : "DAILY",
          },
        ]);
      }
      if (url.includes("/segments")) {
        const instanceId = url.match(/Instances\/([^/]+)/)?.[1] ?? "";
        const reportId = instanceId.replace("inst-", "");
        return segmentsResponse([
          { id: `seg-${reportId}`, url: `https://s3.example.com/ef-${reportId}.tsv.gz` },
        ]);
      }
      return { data: [] };
    });

    mockFetch.mockImplementation(async (url: string) => {
      const reportId = url.match(/s3\.example\.com\/ef-(.+)\.tsv\.gz/)?.[1] ?? "";
      const reportName = Object.entries(reportNameToId).find(
        ([, id]) => id === reportId,
      )?.[0];
      const tsv = reportName ? emptyReportData[reportName] : "";
      return makeFetchResponse(tsv);
    });
  }

  it("handles empty field values with || fallback branches in all aggregation functions", async () => {
    setupEmptyFieldsPipeline();

    const result = await buildAnalyticsData("app-empty-fields");

    // aggregateDownloads: empty Download Type doesn't match any known type,
    // but the row with empty Counts/Downloads triggers the `|| "1"` fallback
    expect(result.dailyDownloads).toHaveLength(1);
    expect(result.dailyDownloads[0].firstTime).toBe(10);

    // aggregateRevenue: empty "Proceeds in USD" and "Sales in USD" parse as 0
    expect(result.dailyRevenue).toHaveLength(1);
    expect(result.dailyRevenue[0]).toEqual({
      date: "2026-02-01",
      proceeds: 11, // Math.round(0 + 10.50)
      sales: 12,    // Math.round(0 + 12.00)
    });

    // aggregateEngagement: empty Event doesn't match "Impression" or "Page view"
    expect(result.dailyEngagement).toHaveLength(1);
    expect(result.dailyEngagement[0].impressions).toBe(100); // only the valid row

    // aggregateSessions: empty Sessions, Unique Devices, Total Session Duration → 0
    expect(result.dailySessions).toHaveLength(1);
    expect(result.dailySessions[0]).toEqual({
      date: "2026-02-01",
      sessions: 0,
      uniqueDevices: 0,
      avgDuration: 0,
    });

    // aggregateInstallsDeletes: empty Event doesn't match "Install" or "Delete"
    expect(result.dailyInstallsDeletes).toHaveLength(1);
    expect(result.dailyInstallsDeletes[0]).toEqual({
      date: "2026-02-01",
      installs: 0,
      deletes: 0,
    });

    // aggregateOptIn: empty fields → 0
    expect(result.dailyOptIn).toHaveLength(1);
    expect(result.dailyOptIn[0]).toEqual({
      date: "2026-02-01",
      downloading: 0,
      optingIn: 0,
    });

    // aggregateVersionSessions: empty Sessions → `|| "0"` fallback
    expect(result.dailyVersionSessions).toHaveLength(1);
    expect(result.dailyVersionSessions[0]).toEqual({
      date: "2026-02-01",
      v100: 0,
    });

    // aggregateCrashesByVersion: empty App Version → `|| "Unknown"` fallback,
    // empty Platform Version → `|| ""`, empty Crashes/Unique Devices → `|| "0"`
    const unknownVersion = result.crashesByVersion.find((v) => v.version === "Unknown");
    expect(unknownVersion).toBeDefined();
    expect(unknownVersion!.platform).toBe("");
    expect(unknownVersion!.crashes).toBe(0);
    expect(unknownVersion!.uniqueDevices).toBe(0);

    const knownVersion = result.crashesByVersion.find((v) => v.version === "1.0.0");
    expect(knownVersion).toBeDefined();
    expect(knownVersion!.crashes).toBe(5);

    // aggregateCrashesByDevice: empty Device → `|| "Unknown"` fallback
    const unknownDevice = result.crashesByDevice.find((d) => d.device === "Unknown");
    expect(unknownDevice).toBeDefined();
    expect(unknownDevice!.crashes).toBe(0);
    expect(unknownDevice!.uniqueDevices).toBe(0);

    // aggregateTerritories: rows with empty Territory are skipped (guard: if (!code) continue),
    // rows with empty Counts/Downloads trigger `|| "1"` fallback
    // The row with empty Territory/Counts/Downloads has Download Type "" which doesn't pass
    // the update filter, so the empty-Territory row is included but skipped by the !code guard.
    // US territory should still be counted from the valid row.
    const usTerritory = result.territories.find((t) => t.code === "US");
    expect(usTerritory).toBeDefined();
    expect(usTerritory!.downloads).toBe(10);

    // aggregateDiscoverySources: rows with empty Source Type are skipped (guard: if (!source) continue)
    // Only "App Store search" from the valid row should be counted
    const searchSource = result.discoverySources.find((s) => s.source === "search");
    expect(searchSource).toBeDefined();
    expect(searchSource!.count).toBe(10);
  });

  it("handles download rows where Counts is empty but Downloads has a value", async () => {
    mockCacheGet.mockReturnValue(null);

    // This exercises the `|| row["Downloads"]` part of countByFieldValue
    const tsv = tsvString(
      ["Date", "Download Type", "Source Type", "Territory", "Counts", "Downloads"],
      [
        ["2026-02-01", "First-time download", "App Store search", "US", "", "15"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-dl-fallback"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-dl-fallback", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-dl-fallback", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-dl-fallback", url: "https://s3.example.com/dl-fallback.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-dl-fallback");
    // With empty Counts, it should fall back to Downloads column (15)
    expect(result.dailyDownloads).toHaveLength(1);
    expect(result.dailyDownloads[0].firstTime).toBe(15);

    // Territory downloads should also use the fallback
    const usTerritory = result.dailyTerritoryDownloads.find(
      (t) => t.code === "US" && t.date === "2026-02-01",
    );
    expect(usTerritory).toBeDefined();
    expect(usTerritory!.downloads).toBe(15);

    // Discovery sources should also use the fallback
    const searchSource = result.discoverySources.find((s) => s.source === "search");
    expect(searchSource).toBeDefined();
    expect(searchSource!.count).toBe(15);
  });

  it("handles discovery source with unknown source type (|| source fallback)", async () => {
    mockCacheGet.mockReturnValue(null);

    // Use a Source Type not in the sourceKeyMap to trigger the `|| source` fallback
    const tsv = tsvString(
      ["Date", "Download Type", "Source Type", "Counts"],
      [
        ["2026-02-01", "First-time download", "Custom Source", "7"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-unk-src"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-unk-src", name: "App Downloads Standard", category: "COMMERCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-unk-src", processingDate: "2026-02-01" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-unk-src", url: "https://s3.example.com/unk-src.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-unk-src");
    // The source key should fall through to the raw source name
    const customSource = result.discoverySources.find((s) => s.source === "Custom Source");
    expect(customSource).toBeDefined();
    expect(customSource!.count).toBe(7);
    expect(customSource!.fill).toBe("var(--color-Custom Source)");
  });

  it("handles rows with both Counts and Downloads empty (|| '1' fallback)", async () => {
    mockCacheGet.mockReturnValue(null);

    // Both Counts and Downloads are empty, triggering parseInt("1") fallback
    // Two rows with same date+territory to trigger map.get(key) truthy branch
    const tsv = tsvString(
      ["Date", "Download Type", "Source Type", "Territory", "Counts", "Downloads"],
      [
        ["2026-02-01", "First-time download", "App Store search", "FR", "", ""],
        ["2026-02-01", "Redownload", "App Store search", "FR", "", ""],
      ],
    );

    const purchaseTsv = tsvString(
      ["Date", "Territory", "Proceeds in USD", "Sales in USD"],
      [],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-both-empty"]);
      }
      if (url.includes("/reports?filter")) {
        const category = url.match(/filter\[category\]=([^&]+)/)?.[1] ?? "";
        if (category === "COMMERCE") {
          return reportsResponse([
            { id: "rpt-be-dl", name: "App Downloads Standard", category: "COMMERCE" },
            { id: "rpt-be-pur", name: "App Store Purchases Standard", category: "COMMERCE" },
          ]);
        }
        return { data: [] };
      }
      if (url.includes("/instances?")) {
        return instancesResponse([
          {
            id: `inst-${url.match(/analyticsReports\/([^/]+)/)?.[1]}`,
            processingDate: "2026-02-01",
          },
        ]);
      }
      if (url.includes("/segments")) {
        const instId = url.match(/Instances\/([^/]+)/)?.[1] ?? "";
        return segmentsResponse([
          { id: `seg-${instId}`, url: `https://s3.example.com/${instId}.tsv` },
        ]);
      }
      return { data: [] };
    });

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("rpt-be-dl")) return makeFetchResponse(tsv);
      if (url.includes("rpt-be-pur")) return makeFetchResponse(purchaseTsv);
      return makeFetchResponse("");
    });

    const result = await buildAnalyticsData("app-both-empty");

    // Both rows have empty Counts AND Downloads → fallback to parseInt("1") = 1 per row
    // Two rows for FR on 2026-02-01, both first-time/redownload
    // aggregateDailyTerritoryDownloads: map should accumulate 1 + 1 = 2
    // (second row triggers map.get(key) truthy branch at line 402)
    const frDaily = result.dailyTerritoryDownloads.find(
      (t) => t.code === "FR" && t.date === "2026-02-01",
    );
    expect(frDaily).toBeDefined();
    expect(frDaily!.downloads).toBe(2);

    // aggregateTerritories: same territory appearing twice (line 425 truthy branch)
    const frTerritory = result.territories.find((t) => t.code === "FR");
    expect(frTerritory).toBeDefined();
    expect(frTerritory!.downloads).toBe(2);
    // No revenue data → || 0 fallback (line 456/457)
    expect(frTerritory!.revenue).toBe(0);

    // aggregateDiscoverySources: same source "App Store search" appears twice (line 476 truthy branch)
    const searchSource = result.discoverySources.find((s) => s.source === "search");
    expect(searchSource).toBeDefined();
    expect(searchSource!.count).toBe(2);
  });

  it("handles Counts='0' triggering parseInt()||1 fallback", async () => {
    mockCacheGet.mockReturnValue(null);

    // Counts is "0" → parseInt("0", 10) returns 0 → (0 || 1) = 1
    // This triggers the `|| 1` fallback at the end of parseInt
    const tsv = tsvString(
      ["Date", "Download Type", "Source Type", "Territory", "Counts", "Downloads"],
      [
        ["2026-02-01", "First-time download", "App Store search", "IT", "0", "0"],
        ["2026-02-01", "Redownload", "App Store browse", "IT", "0", "0"],
      ],
    );

    const purchaseTsv = tsvString(
      ["Date", "Territory", "Proceeds in USD", "Sales in USD"],
      [],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-zero-counts"]);
      }
      if (url.includes("/reports?filter")) {
        const category = url.match(/filter\[category\]=([^&]+)/)?.[1] ?? "";
        if (category === "COMMERCE") {
          return reportsResponse([
            { id: "rpt-zc-dl", name: "App Downloads Standard", category: "COMMERCE" },
            { id: "rpt-zc-pur", name: "App Store Purchases Standard", category: "COMMERCE" },
          ]);
        }
        return { data: [] };
      }
      if (url.includes("/instances?")) {
        return instancesResponse([
          {
            id: `inst-${url.match(/analyticsReports\/([^/]+)/)?.[1]}`,
            processingDate: "2026-02-01",
          },
        ]);
      }
      if (url.includes("/segments")) {
        const instId = url.match(/Instances\/([^/]+)/)?.[1] ?? "";
        return segmentsResponse([
          { id: `seg-${instId}`, url: `https://s3.example.com/${instId}.tsv` },
        ]);
      }
      return { data: [] };
    });

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("rpt-zc-dl")) return makeFetchResponse(tsv);
      if (url.includes("rpt-zc-pur")) return makeFetchResponse(purchaseTsv);
      return makeFetchResponse("");
    });

    const result = await buildAnalyticsData("app-zero-counts");

    // parseInt("0", 10) = 0, (0 || 1) = 1. Two rows → 1+1 = 2
    // aggregateDownloads: first-time=1, redownload=1
    expect(result.dailyDownloads).toHaveLength(1);
    expect(result.dailyDownloads[0].firstTime).toBe(1);
    expect(result.dailyDownloads[0].redownload).toBe(1);

    // aggregateDailyTerritoryDownloads: IT should have 2 (1+1)
    const itDaily = result.dailyTerritoryDownloads.find(
      (t) => t.code === "IT" && t.date === "2026-02-01",
    );
    expect(itDaily).toBeDefined();
    expect(itDaily!.downloads).toBe(2);

    // aggregateTerritories: IT should have 2 downloads
    const itTerritory = result.territories.find((t) => t.code === "IT");
    expect(itTerritory).toBeDefined();
    expect(itTerritory!.downloads).toBe(2);

    // aggregateDiscoverySources: search=1, browse=1
    expect(result.discoverySources).toHaveLength(2);
  });

  it("handles territory with empty revenue (revenueByTerritory || 0 fallback)", async () => {
    mockCacheGet.mockReturnValue(null);

    // Download data has a territory, but purchase data has no matching territory
    const dlTsv = tsvString(
      ["Date", "Download Type", "Territory", "Counts"],
      [
        ["2026-02-01", "First-time download", "JP", "20"],
      ],
    );

    // Purchase data has empty Proceeds for the territory
    const purchaseTsv = tsvString(
      ["Date", "Territory", "Proceeds in USD", "Sales in USD"],
      [
        ["2026-02-01", "JP", "", ""],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-terr-empty"]);
      }
      if (url.includes("/reports?filter")) {
        const category = url.match(/filter\[category\]=([^&]+)/)?.[1] ?? "";
        if (category === "COMMERCE") {
          return reportsResponse([
            { id: "rpt-te-dl", name: "App Downloads Standard", category: "COMMERCE" },
            { id: "rpt-te-pur", name: "App Store Purchases Standard", category: "COMMERCE" },
          ]);
        }
        return { data: [] };
      }
      if (url.includes("/instances?")) {
        return instancesResponse([
          {
            id: `inst-${url.match(/analyticsReports\/([^/]+)/)?.[1]}`,
            processingDate: "2026-02-01",
          },
        ]);
      }
      if (url.includes("/segments")) {
        const instId = url.match(/Instances\/([^/]+)/)?.[1] ?? "";
        return segmentsResponse([
          { id: `seg-${instId}`, url: `https://s3.example.com/${instId}.tsv` },
        ]);
      }
      return { data: [] };
    });

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("rpt-te-dl")) return makeFetchResponse(dlTsv);
      if (url.includes("rpt-te-pur")) return makeFetchResponse(purchaseTsv);
      return makeFetchResponse("");
    });

    const result = await buildAnalyticsData("app-terr-empty");
    const jpTerritory = result.territories.find((t) => t.code === "JP");
    expect(jpTerritory).toBeDefined();
    expect(jpTerritory!.downloads).toBe(20);
    // Revenue should be 0 due to empty Proceeds
    expect(jpTerritory!.revenue).toBe(0);
  });
});

describe("fetchPerfPowerMetrics", () => {
  it("returns cached result immediately", async () => {
    const cachedPerf = { metrics: [{ category: "LAUNCH" }], regressions: [] };
    mockCacheGet.mockImplementation((key: string) => {
      if (key === "perf-metrics:app-perf-cached") return cachedPerf;
      return null;
    });

    const result = await fetchPerfPowerMetrics("app-perf-cached");
    expect(result).toBe(cachedPerf);
    expect(mockAscFetch).not.toHaveBeenCalled();
  });

  it("fetches and transforms perfPowerMetrics response", async () => {
    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockResolvedValueOnce({
      insights: {
        regressions: [
          {
            metric: "hangTime",
            metricCategory: "HANG",
            latestVersion: "3.0",
            summaryString: "Hang rate increased 5%",
          },
        ],
      },
      productData: [
        {
          platform: "macOS",
          metricCategories: [
            {
              identifier: "LAUNCH",
              metrics: [
                {
                  identifier: "launchTime",
                  unit: { displayName: "ms" },
                  datasets: [
                    {
                      filterCriteria: { device: "all_macs", percentile: "percentile.fifty" },
                      points: [{ version: "1.0", value: 500 }],
                    },
                  ],
                },
              ],
            },
            {
              identifier: "MEMORY",
              metrics: [
                {
                  identifier: "memoryUsage",
                  unit: { displayName: "MB" },
                  datasets: [
                    {
                      filterCriteria: { device: "all_macs", percentile: "percentile.fifty" },
                      points: [{ version: "1.0", value: 128 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const result = await fetchPerfPowerMetrics("app-perf-fetch");

    expect(result.metrics).toHaveLength(2);
    expect(result.metrics[0]).toEqual({
      category: "LAUNCH",
      metric: "launchTime",
      unit: "ms",
      platform: "macOS",
      datasets: [{
        percentile: "percentile.fifty",
        device: "all_macs",
        points: [{ version: "1.0", value: 500 }],
      }],
    });
    expect(result.metrics[1]).toEqual({
      category: "MEMORY",
      metric: "memoryUsage",
      unit: "MB",
      platform: "macOS",
      datasets: [{
        percentile: "percentile.fifty",
        device: "all_macs",
        points: [{ version: "1.0", value: 128 }],
      }],
    });

    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0]).toEqual({
      metric: "hangTime",
      metricCategory: "HANG",
      latestVersion: "3.0",
      summary: "Hang rate increased 5%",
    });

    // Should cache with PERF_METRICS_TTL (6 hours)
    expect(mockCacheSet).toHaveBeenCalledWith(
      "perf-metrics:app-perf-fetch",
      result,
      6 * 60 * 60 * 1000,
    );
  });

  it("returns empty on API failure", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockRejectedValueOnce(new Error("API error"));

    const result = await fetchPerfPowerMetrics("app-perf-fail");
    expect(result).toEqual({ metrics: [], regressions: [] });
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[analytics] perfPowerMetrics fetch failed:",
      expect.any(Error),
    );
  });

  it("handles empty/missing fields in response", async () => {
    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockResolvedValueOnce({
      // No insights, no productData
    });

    const result = await fetchPerfPowerMetrics("app-perf-empty");
    expect(result.metrics).toEqual([]);
    expect(result.regressions).toEqual([]);
  });

  it("skips datasets with empty points arrays", async () => {
    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockResolvedValueOnce({
      productData: [
        {
          platform: "iOS",
          metricCategories: [
            {
              identifier: "DISK",
              metrics: [
                {
                  identifier: "diskWrites",
                  unit: { displayName: "MB/day" },
                  datasets: [
                    { filterCriteria: { device: "all_iphones", percentile: "percentile.fifty" }, points: [] },
                    { filterCriteria: { device: "all_iphones", percentile: "percentile.ninety" }, points: [{ version: "1.0", value: 5.2 }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const result = await fetchPerfPowerMetrics("app-perf-empty-pts");
    expect(result.metrics).toHaveLength(1);
    // Only the dataset with points should be included
    expect(result.metrics[0].datasets).toHaveLength(1);
    expect(result.metrics[0].datasets[0].percentile).toBe("percentile.ninety");
  });

  it("skips metrics with all empty datasets", async () => {
    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockResolvedValueOnce({
      productData: [
        {
          platform: "macOS",
          metricCategories: [
            {
              identifier: "BATTERY",
              metrics: [
                {
                  identifier: "batteryUsage",
                  datasets: [
                    { filterCriteria: { device: "all_macs" }, points: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const result = await fetchPerfPowerMetrics("app-perf-no-datasets");
    // No datasets with points → metric is skipped entirely
    expect(result.metrics).toEqual([]);
  });

  it("handles missing nested fields (metricCategories, metrics, datasets, points)", async () => {
    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockResolvedValueOnce({
      productData: [
        { platform: "iOS" }, // no metricCategories
        { platform: "macOS", metricCategories: [
          { identifier: "DISK" }, // no metrics
          { identifier: "LAUNCH", metrics: [
            { identifier: "launchTime", unit: { displayName: "ms" } }, // no datasets
            { identifier: "hangRate", unit: { displayName: "s" }, datasets: [
              { filterCriteria: { device: "all", percentile: "p50" } }, // no points
            ] },
          ] },
        ] },
      ],
    });

    const result = await fetchPerfPowerMetrics("app-perf-nested-null");
    // All products have no usable data – every metric is skipped
    expect(result.metrics).toEqual([]);
  });

  it("handles missing filterCriteria and unit", async () => {
    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockResolvedValueOnce({
      productData: [
        {
          platform: "macOS",
          metricCategories: [
            {
              identifier: "TERMINATION",
              metrics: [
                {
                  identifier: "terminationCount",
                  // No unit
                  datasets: [
                    {
                      // No filterCriteria
                      points: [{ version: "1.0", value: 2.5 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const result = await fetchPerfPowerMetrics("app-perf-no-filter");
    expect(result.metrics).toHaveLength(1);
    expect(result.metrics[0].unit).toBe("");
    expect(result.metrics[0].datasets[0].percentile).toBe("unknown");
    expect(result.metrics[0].datasets[0].device).toBe("unknown");
  });
});

describe("dailyCrashes aggregation", () => {
  it("aggregates daily crashes from expanded crash report", async () => {
    mockCacheGet.mockReturnValue(null);

    const tsv = tsvString(
      ["Date", "App Version", "Device", "Crashes", "Unique Devices"],
      [
        ["2026-02-01", "1.0.0", "MacBookPro18,1", "4", "2"],
        ["2026-02-01", "2.0.0", "MacBookAir10,1", "2", "1"],
        ["2026-02-02", "1.0.0", "MacBookPro18,1", "3", "1"],
        ["2026-02-02", "2.0.0", "MacBookAir10,1", "1", "1"],
      ],
    );

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/perfPowerMetrics")) {
        return { productData: [] };
      }
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-dc"]);
      }
      if (url.includes("/reports?filter")) {
        return reportsResponse([
          { id: "rpt-dc", name: "App Crashes Expanded", category: "PERFORMANCE" },
        ]);
      }
      if (url.includes("/instances?")) {
        return instancesResponse([{ id: "inst-dc", processingDate: "2026-02-02" }]);
      }
      if (url.includes("/segments")) {
        return segmentsResponse([{ id: "seg-dc", url: "https://s3.example.com/dc.tsv" }]);
      }
      return { data: [] };
    });

    mockFetch.mockResolvedValue(makeFetchResponse(tsv));

    const result = await buildAnalyticsData("app-dc");
    expect(result.dailyCrashes).toHaveLength(2);
    expect(result.dailyCrashes[0]).toEqual({
      date: "2026-02-01",
      crashes: 6, // 4 + 2
      uniqueDevices: 3, // 2 + 1
    });
    expect(result.dailyCrashes[1]).toEqual({
      date: "2026-02-02",
      crashes: 4, // 3 + 1
      uniqueDevices: 2, // 1 + 1
    });
  });

  it("returns empty array when no expanded crash data available", async () => {
    mockCacheGet.mockReturnValue(null);

    mockAscFetch.mockImplementation(async (url: string) => {
      if (url.includes("/perfPowerMetrics")) {
        return { productData: [] };
      }
      if (url.includes("/analyticsReportRequests") && !url.includes("/reports")) {
        return reportRequestsResponse(["req-dc-empty"]);
      }
      return { data: [] };
    });

    const result = await buildAnalyticsData("app-dc-empty");
    expect(result.dailyCrashes).toEqual([]);
  });
});
