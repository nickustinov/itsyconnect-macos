import { describe, it, expect } from "vitest";
import {
  mergeAnalyticsData,
  normaliseAnalyticsData,
  emptyAnalyticsData,
  findDateGaps,
  downloadGapSignature,
  type AnalyticsData,
} from "@/lib/asc/analytics-types";

function make(overrides: Partial<AnalyticsData>): AnalyticsData {
  return { ...emptyAnalyticsData(), ...overrides };
}

const dl = (date: string, firstTime: number) => ({ date, firstTime, redownload: 0, update: 0 });

describe("mergeAnalyticsData – daily series", () => {
  it("unions dates from both sides and sorts ascending", () => {
    const existing = make({ dailyDownloads: [dl("2026-01-02", 5)] });
    const fresh = make({ dailyDownloads: [dl("2026-01-01", 3)] });
    const merged = mergeAnalyticsData(existing, fresh);
    expect(merged.dailyDownloads.map((r) => r.date)).toEqual(["2026-01-01", "2026-01-02"]);
  });

  it("lets fresh override the same day", () => {
    const existing = make({ dailyDownloads: [dl("2026-01-01", 3)] });
    const fresh = make({ dailyDownloads: [dl("2026-01-01", 9)] });
    const merged = mergeAnalyticsData(existing, fresh);
    expect(merged.dailyDownloads).toEqual([dl("2026-01-01", 9)]);
  });

  it("keeps historic days Apple stops returning", () => {
    const existing = make({ dailyDownloads: [dl("2026-01-01", 3), dl("2026-01-02", 4)] });
    const fresh = make({ dailyDownloads: [dl("2026-01-02", 4)] });
    const merged = mergeAnalyticsData(existing, fresh);
    expect(merged.dailyDownloads.map((r) => r.date)).toEqual(["2026-01-01", "2026-01-02"]);
  });

  it("merges territory downloads by date+code and sorts by date then code", () => {
    const existing = make({
      dailyTerritoryDownloads: [{ date: "2026-01-01", code: "USA", downloads: 5 }],
    });
    const fresh = make({
      dailyTerritoryDownloads: [
        { date: "2026-01-01", code: "DEU", downloads: 2 },
        { date: "2026-01-01", code: "USA", downloads: 7 },
      ],
    });
    const merged = mergeAnalyticsData(existing, fresh);
    expect(merged.dailyTerritoryDownloads).toEqual([
      { date: "2026-01-01", code: "DEU", downloads: 2 },
      { date: "2026-01-01", code: "USA", downloads: 7 },
    ]);
  });

  it("merges territory proceeds by date+code and sorts by date then code", () => {
    const existing = make({
      dailyTerritoryRevenue: [
        { date: "2026-01-02", code: "USA", proceeds: 1 },
        { date: "2026-01-01", code: "USA", proceeds: 5 },
      ],
    });
    const fresh = make({
      dailyTerritoryRevenue: [
        { date: "2026-01-01", code: "DEU", proceeds: 2 },
        { date: "2026-01-01", code: "USA", proceeds: 7 },
      ],
    });
    const merged = mergeAnalyticsData(existing, fresh);
    expect(merged.dailyTerritoryRevenue).toEqual([
      { date: "2026-01-01", code: "DEU", proceeds: 2 },
      { date: "2026-01-01", code: "USA", proceeds: 7 },
      { date: "2026-01-02", code: "USA", proceeds: 1 },
    ]);
  });
});

describe("normaliseAnalyticsData", () => {
  it("fills in series missing from data cached by an older version", () => {
    const old = { ...emptyAnalyticsData(), dailyDownloads: [dl("2026-01-01", 3)] } as Partial<AnalyticsData>;
    delete old.dailyTerritoryRevenue;
    const normalised = normaliseAnalyticsData(old as AnalyticsData);
    expect(normalised.dailyTerritoryRevenue).toEqual([]);
    expect(normalised.dailyDownloads).toEqual([dl("2026-01-01", 3)]);
  });

  it("gives older source rows a zero for every source they lack", () => {
    const old = make({
      dailyDownloadsBySource: [
        { date: "2026-01-01", search: 4, browse: 2, webReferrer: 1, unavailable: 0 } as AnalyticsData["dailyDownloadsBySource"][number],
      ],
    });
    expect(normaliseAnalyticsData(old).dailyDownloadsBySource).toEqual([
      {
        date: "2026-01-01",
        search: 4,
        browse: 2,
        appReferrer: 0,
        webReferrer: 1,
        appClip: 0,
        institutionalPurchase: 0,
        unavailable: 0,
      },
    ]);
  });
});

describe("mergeAnalyticsData – window-cumulative aggregates", () => {
  it("merges crash aggregates by total", () => {
    const existing = make({
      crashesByVersion: [{ version: "1.0", platform: "IOS", crashes: 50, uniqueDevices: 5 }],
      crashesByDevice: [{ device: "iPhone", crashes: 8, uniqueDevices: 2 }],
    });
    const fresh = make({
      crashesByVersion: [{ version: "1.0", platform: "IOS", crashes: 10, uniqueDevices: 1 }],
      crashesByDevice: [{ device: "iPhone", crashes: 20, uniqueDevices: 4 }],
    });
    const merged = mergeAnalyticsData(existing, fresh);
    expect(merged.crashesByVersion[0].crashes).toBe(50); // existing larger → kept
    expect(merged.crashesByDevice[0].crashes).toBe(20); // fresh larger → taken
  });
});

describe("mergeAnalyticsData – perf metrics (current-state)", () => {
  const series = [{ category: "c", metric: "m", unit: "s", platform: "IOS", datasets: [] }];
  const regression = [{ metric: "m", metricCategory: "c", latestVersion: "1.0", summary: "s" }];

  it("prefers fresh perf data when present", () => {
    const existing = make({ perfMetrics: [], perfRegressions: [] });
    const fresh = make({ perfMetrics: series, perfRegressions: regression });
    const merged = mergeAnalyticsData(existing, fresh);
    expect(merged.perfMetrics).toBe(series);
    expect(merged.perfRegressions).toBe(regression);
  });

  it("keeps existing perf data when fresh is empty", () => {
    const existing = make({ perfMetrics: series, perfRegressions: regression });
    const fresh = make({ perfMetrics: [], perfRegressions: [] });
    const merged = mergeAnalyticsData(existing, fresh);
    expect(merged.perfMetrics).toBe(series);
    expect(merged.perfRegressions).toBe(regression);
  });
});

const dlOn = (date: string) => ({ date, firstTime: 1, redownload: 0, update: 0 });

describe("findDateGaps", () => {
  it("returns nothing for fewer than two dates", () => {
    expect(findDateGaps([])).toEqual([]);
    expect(findDateGaps(["2026-01-01"])).toEqual([]);
  });

  it("returns nothing for consecutive dates", () => {
    expect(findDateGaps(["2026-01-01", "2026-01-02", "2026-01-03"])).toEqual([]);
  });

  it("reports a gap with its bounds and missing-day count", () => {
    expect(findDateGaps(["2026-01-01", "2026-01-05"])).toEqual([
      { from: "2026-01-01", to: "2026-01-05", missingDays: 3 },
    ]);
  });

  it("finds multiple gaps and dedupes/sorts input", () => {
    const gaps = findDateGaps(["2026-01-03", "2026-01-01", "2026-01-03", "2026-01-10"]);
    expect(gaps).toEqual([
      { from: "2026-01-01", to: "2026-01-03", missingDays: 1 },
      { from: "2026-01-03", to: "2026-01-10", missingDays: 6 },
    ]);
  });
});

describe("downloadGapSignature", () => {
  it("is empty when there are no significant gaps", () => {
    const data = make({ dailyDownloads: [dlOn("2026-01-01"), dlOn("2026-01-02"), dlOn("2026-01-03")] });
    expect(downloadGapSignature(data)).toBe("");
  });

  it("ignores short (sub-threshold) gaps but reports long ones", () => {
    const data = make({
      dailyDownloads: [dlOn("2026-01-01"), dlOn("2026-01-03"), dlOn("2026-01-20")], // 1-day then 16-day gap
    });
    expect(downloadGapSignature(data)).toBe("2026-01-03_2026-01-20");
  });
});
