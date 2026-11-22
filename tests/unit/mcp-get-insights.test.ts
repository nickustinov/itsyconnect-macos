import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ── Mocks ──────────────────────────────────────────────────────

const mockHasCredentials = vi.fn();
const mockListCustomerReviews = vi.fn();
const mockBuildAnalyticsData = vi.fn();
const mockListFeedback = vi.fn();
const mockListBuilds = vi.fn();
const mockListDiagnosticSignatures = vi.fn();
const mockResolveApp = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: () => mockHasCredentials(),
}));

vi.mock("@/lib/asc/reviews", () => ({
  listCustomerReviews: (...args: unknown[]) => mockListCustomerReviews(...args),
}));

vi.mock("@/lib/asc/analytics", () => ({
  buildAnalyticsData: (...args: unknown[]) => mockBuildAnalyticsData(...args),
}));

vi.mock("@/lib/asc/testflight/feedback", () => ({
  listFeedback: (...args: unknown[]) => mockListFeedback(...args),
}));

vi.mock("@/lib/asc/testflight/builds", () => ({
  listBuilds: (...args: unknown[]) => mockListBuilds(...args),
}));

vi.mock("@/lib/asc/testflight/diagnostics", () => ({
  listDiagnosticSignatures: (...args: unknown[]) => mockListDiagnosticSignatures(...args),
}));

vi.mock("@/mcp/resolve", () => ({
  resolveApp: (...args: unknown[]) => mockResolveApp(...args),
  isError: (result: unknown) =>
    typeof result === "object" && result !== null && "error" in result,
}));

// ── Helpers ────────────────────────────────────────────────────

let toolHandler: (args: Record<string, unknown>) => Promise<CallToolResult>;

function fakeServer(): McpServer {
  return {
    registerTool: (_name: string, _config: unknown, handler: typeof toolHandler) => {
      toolHandler = handler;
    },
  } as unknown as McpServer;
}

function fakeApp(name = "TestApp") {
  return {
    id: "app-1",
    attributes: { name, primaryLocale: "en-US" },
  };
}

function fakeReview(rating: number, title: string, body: string, daysAgo = 0, response = false) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `review-${Math.random()}`,
    attributes: {
      rating,
      title,
      body,
      reviewerNickname: "user",
      createdDate: d.toISOString(),
      territory: "USA",
    },
    ...(response ? { response: { id: "resp-1", attributes: { responseBody: "Thanks!", lastModifiedDate: d.toISOString(), state: "PUBLISHED" as const } } } : {}),
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoDate(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function emptyAnalytics() {
  return {
    dailyDownloads: [],
    dailyRevenue: [],
    dailyEngagement: [],
    dailySessions: [],
    dailyInstallsDeletes: [],
    dailyDownloadsBySource: [],
    dailyTerritoryDownloads: [],
    dailyVersionSessions: [],
    dailyOptIn: [],
    dailyWebPreview: [],
    dailyTerritoryRevenue: [],
    crashesByVersion: [],
    crashesByDevice: [],
    dailyCrashes: [],
    perfMetrics: [],
    perfRegressions: [],
  };
}

function sourceRow(date: string, counts: Record<string, number>) {
  return {
    date,
    search: 0,
    browse: 0,
    appReferrer: 0,
    webReferrer: 0,
    appClip: 0,
    institutionalPurchase: 0,
    unavailable: 0,
    ...counts,
  };
}

// ── Setup ──────────────────────────────────────────────────────

beforeEach(async () => {
  vi.resetAllMocks();
  mockHasCredentials.mockReturnValue(true);
  mockResolveApp.mockResolvedValue(fakeApp());
  mockListCustomerReviews.mockResolvedValue([]);
  mockBuildAnalyticsData.mockResolvedValue(emptyAnalytics());
  mockListFeedback.mockResolvedValue([]);
  mockListBuilds.mockResolvedValue([]);
  mockListDiagnosticSignatures.mockResolvedValue([]);

  const { registerGetInsights } = await import("@/mcp/tools/get-insights");
  registerGetInsights(fakeServer());
});

// ── Tests ──────────────────────────────────────────────────────

describe("get_insights", () => {
  it("returns error when no credentials", async () => {
    mockHasCredentials.mockReturnValue(false);
    const result = await toolHandler({ app: "Test", topic: "overview" });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("credentials");
  });

  it("returns error when app not found", async () => {
    mockResolveApp.mockResolvedValue({ error: 'App "Nope" not found.' });
    const result = await toolHandler({ app: "Nope", topic: "overview" });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("not found");
  });

  describe("reviews topic", () => {
    it("returns rating distribution and recent reviews", async () => {
      mockListCustomerReviews.mockResolvedValue([
        fakeReview(5, "Great app", "Love it", 2),
        fakeReview(4, "Good", "Works well", 5),
        fakeReview(1, "Broken", "Crashes all the time", 3),
      ]);

      const result = await toolHandler({ app: "Test", topic: "reviews", period: "week" });
      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain("3 total");
      expect(text).toContain("3.3"); // avg rating
      expect(text).toContain("5★ 1");
      expect(text).toContain("4★ 1");
      expect(text).toContain("1★ 1");
      expect(text).toContain("Great app");
      expect(text).toContain("Broken");
    });

    it("shows unanswered count", async () => {
      mockListCustomerReviews.mockResolvedValue([
        fakeReview(5, "A", "B", 1, true),
        fakeReview(3, "C", "D", 1, false),
      ]);

      const result = await toolHandler({ app: "Test", topic: "reviews" });
      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain("Unanswered: 1");
    });

    it("handles no reviews", async () => {
      const result = await toolHandler({ app: "Test", topic: "reviews" });
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("No customer reviews");
    });
  });

  describe("analytics topic", () => {
    it("returns download and revenue summaries", async () => {
      mockBuildAnalyticsData.mockResolvedValue({
        ...emptyAnalytics(),
        dailyDownloads: [
          { date: today(), firstTime: 100, redownload: 20, update: 5 },
          { date: daysAgoDate(1), firstTime: 80, redownload: 15, update: 3 },
        ],
        dailyRevenue: [
          { date: today(), proceeds: 150.50, sales: 2 },
          { date: daysAgoDate(1), proceeds: 120.00, sales: 1 },
        ],
        dailySessions: [
          { date: today(), sessions: 500, uniqueDevices: 200, avgDuration: 120 },
        ],
        dailyEngagement: [
          { date: today(), impressions: 5000, pageViews: 800 },
        ],
        dailyCrashes: [
          { date: today(), crashes: 3, uniqueDevices: 2 },
        ],
        dailyTerritoryDownloads: [
          { date: today(), code: "US", downloads: 100 },
          { date: today(), code: "DE", downloads: 50 },
        ],
        dailyTerritoryRevenue: [
          { date: today(), code: "US", proceeds: 200 },
          { date: today(), code: "DE", proceeds: 80 },
        ],
        dailyDownloadsBySource: [
          sourceRow(today(), { search: 80, appReferrer: 20 }),
        ],
      });

      const result = await toolHandler({ app: "Test", topic: "analytics", period: "week" });
      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain("Downloads: 215");
      expect(text).toContain("180 first-time");
      expect(text).toContain("$270.50");
      expect(text).toContain("Sessions: 500");
      expect(text).toContain("- United States (US): 100 downloads, $200.00");
      expect(text).toContain("- App Store search: 80 (80%)");
      expect(text).toContain("- App referrer: 20 (20%)");
    });

    it("limits territories and discovery sources to the period", async () => {
      mockBuildAnalyticsData.mockResolvedValue({
        ...emptyAnalytics(),
        dailyDownloads: [{ date: today(), firstTime: 10, redownload: 0, update: 0 }],
        dailyTerritoryDownloads: [
          { date: today(), code: "US", downloads: 10 },
          { date: daysAgoDate(60), code: "US", downloads: 500 },
          { date: daysAgoDate(60), code: "JP", downloads: 300 },
        ],
        dailyTerritoryRevenue: [
          { date: today(), code: "US", proceeds: 5 },
          { date: daysAgoDate(60), code: "US", proceeds: 900 },
        ],
        dailyDownloadsBySource: [
          sourceRow(today(), { search: 10 }),
          sourceRow(daysAgoDate(60), { browse: 800 }),
        ],
      });

      const result = await toolHandler({ app: "Test", topic: "analytics", period: "week" });
      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain("- United States (US): 10 downloads, $5.00");
      expect(text).not.toContain("Japan");
      expect(text).toContain("- App Store search: 10 (100%)");
      expect(text).not.toContain("App Store browse");
    });

    it("handles empty analytics", async () => {
      const result = await toolHandler({ app: "Test", topic: "analytics" });
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("No analytics data");
    });

    it("shows performance regressions", async () => {
      mockBuildAnalyticsData.mockResolvedValue({
        ...emptyAnalytics(),
        dailyDownloads: [{ date: today(), firstTime: 10, redownload: 0, update: 0 }],
        dailyRevenue: [],
        dailySessions: [],
        dailyEngagement: [],
        dailyCrashes: [],
        perfRegressions: [
          { metric: "hangRate", metricCategory: "Responsiveness", latestVersion: "2.0", summary: "Increased by 15%" },
        ],
      });

      const result = await toolHandler({ app: "Test", topic: "analytics" });
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("Responsiveness/hangRate");
      expect(text).toContain("Increased by 15%");
    });
  });

  describe("stability topic", () => {
    it("returns crash data and feedback", async () => {
      mockBuildAnalyticsData.mockResolvedValue({
        ...emptyAnalytics(),
        dailyCrashes: [{ date: today(), crashes: 42, uniqueDevices: 30 }],
        crashesByVersion: [
          { version: "2.0", platform: "IOS", crashes: 30, uniqueDevices: 20 },
          { version: "1.9", platform: "IOS", crashes: 12, uniqueDevices: 10 },
        ],
        crashesByDevice: [
          { device: "iPhone 15 Pro", crashes: 15, uniqueDevices: 10 },
        ],
        perfRegressions: [],
      });

      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 1);
      mockListFeedback.mockResolvedValue([
        {
          id: "fb-1",
          type: "crash",
          comment: "App crashed on launch",
          email: null,
          testerName: "Test User",
          createdDate: recentDate.toISOString(),
          buildNumber: "100",
          buildBundleId: null,
          appPlatform: "IOS",
          devicePlatform: "IOS",
          deviceFamily: "iPhone",
          deviceModel: "iPhone 15 Pro",
          osVersion: "18.1",
          locale: "en-US",
          architecture: "arm64e",
          connectionType: "WIFI",
          batteryPercentage: 80,
          timeZone: "America/New_York",
          appUptimeMs: 1000,
          diskBytesAvailable: null,
          diskBytesTotal: null,
          screenWidth: 393,
          screenHeight: 852,
          pairedAppleWatch: null,
          screenshots: [],
          hasCrashLog: true,
        },
      ]);

      mockListBuilds.mockResolvedValue([
        {
          id: "build-1",
          buildNumber: "100",
          versionString: "2.0",
          platform: "IOS",
          status: "Testing",
          internalBuildState: null,
          externalBuildState: "IN_BETA_TESTING",
          uploadedDate: today(),
          expirationDate: null,
          expired: false,
          minOsVersion: "15.0",
          whatsNew: null,
          whatsNewLocalizationId: null,
          groupIds: [],
          iconUrl: null,
          installs: 50,
          sessions: 200,
          crashes: 5,
          invites: 10,
          feedbackCount: 3,
        },
      ]);

      mockListDiagnosticSignatures.mockResolvedValue([
        { id: "sig-1", diagnosticType: "HANGS", signature: "hang1", weight: 5 },
        { id: "sig-2", diagnosticType: "HANGS", signature: "hang2", weight: 3 },
        { id: "sig-3", diagnosticType: "DISK_WRITES", signature: "disk1", weight: 2 },
      ]);

      const result = await toolHandler({ app: "Test", topic: "stability", period: "month" });
      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain("Crashes: 42");
      expect(text).toContain("v2.0 (IOS): 30 crashes");
      expect(text).toContain("iPhone 15 Pro");
      expect(text).toContain("App crashed on launch");
      expect(text).toContain("HANGS: 2 signatures");
      expect(text).toContain("DISK_WRITES: 1 signatures");
    });

    it("filters by version", async () => {
      mockBuildAnalyticsData.mockResolvedValue({
        ...emptyAnalytics(),
        crashesByVersion: [
          { version: "2.0", platform: "IOS", crashes: 30, uniqueDevices: 20 },
          { version: "1.9", platform: "IOS", crashes: 12, uniqueDevices: 10 },
        ],
        dailyCrashes: [],
        crashesByDevice: [],
        perfRegressions: [],
      });
      mockListBuilds.mockResolvedValue([
        { id: "b-1", buildNumber: "100", versionString: "2.0", platform: "IOS", status: "Testing" },
        { id: "b-2", buildNumber: "99", versionString: "1.9", platform: "IOS", status: "Expired" },
      ]);

      const result = await toolHandler({ app: "Test", topic: "stability", version: "2.0" });
      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain("v2.0");
      expect(text).not.toContain("v1.9");
    });
  });

  describe("overview topic", () => {
    it("returns combined summary", async () => {
      mockBuildAnalyticsData.mockResolvedValue({
        ...emptyAnalytics(),
        dailyDownloads: [{ date: today(), firstTime: 50, redownload: 10, update: 0 }],
        dailyRevenue: [{ date: today(), proceeds: 99.99, sales: 1 }],
        dailyCrashes: [{ date: today(), crashes: 5, uniqueDevices: 3 }],
        perfRegressions: [
          { metric: "m", metricCategory: "c", latestVersion: "1.0", summary: "bad" },
        ],
      });

      mockListCustomerReviews.mockResolvedValue([
        fakeReview(5, "Nice", "Good app", 1),
        fakeReview(2, "Bad", "Very bad experience with this app", 2),
      ]);

      mockListBuilds.mockResolvedValue([
        {
          id: "b-1", buildNumber: "50", versionString: "1.0", platform: "IOS",
          status: "Testing", installs: 20, sessions: 100, crashes: 2, feedbackCount: 1,
        },
      ]);

      const result = await toolHandler({ app: "Test", topic: "overview", period: "month" });
      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain("Downloads: 60");
      expect(text).toContain("$99.99");
      expect(text).toContain("Crashes: 5");
      expect(text).toContain("3.5/5");
      expect(text).toContain("2 unanswered");
      expect(text).toContain("Bad");
      expect(text).toContain("v1.0 (50)");
      expect(text).toContain("Performance regressions: 1");
    });

    it("handles analytics unavailable gracefully", async () => {
      mockBuildAnalyticsData.mockRejectedValue(new Error("fail"));

      const result = await toolHandler({ app: "Test", topic: "overview" });
      const text = (result.content[0] as { text: string }).text;

      expect(result.isError).toBeUndefined();
      expect(text).toContain("not available");
    });
  });

  describe("period filtering", () => {
    it("defaults to month (30 days)", async () => {
      mockListCustomerReviews.mockResolvedValue([
        fakeReview(5, "Old", "Old review", 45),
        fakeReview(3, "Recent", "Recent review", 5),
      ]);

      const result = await toolHandler({ app: "Test", topic: "reviews" });
      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain("last 30 days");
      expect(text).toContain("Recent");
      // Old review is beyond 30 days, shouldn't appear in recent section
    });

    it("respects week period", async () => {
      mockBuildAnalyticsData.mockResolvedValue({
        ...emptyAnalytics(),
        dailyDownloads: [{ date: today(), firstTime: 1, redownload: 0, update: 0 }],
      });
      const result = await toolHandler({ app: "Test", topic: "analytics", period: "week" });
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("7 days");
    });

    it("respects quarter period", async () => {
      mockBuildAnalyticsData.mockResolvedValue({
        ...emptyAnalytics(),
        dailyDownloads: [{ date: today(), firstTime: 1, redownload: 0, update: 0 }],
      });
      const result = await toolHandler({ app: "Test", topic: "analytics", period: "quarter" });
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("90 days");
    });
  });
});
