import { describe, it, expect } from "vitest";
import {
  discoverySourceName,
  sumDiscoverySources,
  sumTerritories,
} from "@/lib/asc/analytics-summary";
import { DISCOVERY_SOURCES, type DailySourceDownloads } from "@/lib/asc/analytics-types";

function sources(date: string, counts: Partial<Omit<DailySourceDownloads, "date">>): DailySourceDownloads {
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

describe("sumDiscoverySources", () => {
  it("adds up each source over the given days, largest first", () => {
    const result = sumDiscoverySources([
      sources("2026-11-01", { search: 10, appReferrer: 3, webReferrer: 1 }),
      sources("2026-11-02", { search: 5, appReferrer: 4, browse: 2 }),
    ]);
    expect(result).toEqual([
      { source: "search", count: 15 },
      { source: "appReferrer", count: 7 },
      { source: "browse", count: 2 },
      { source: "webReferrer", count: 1 },
    ]);
  });

  it("covers every source Apple reports", () => {
    const one = Object.fromEntries(DISCOVERY_SOURCES.map((s) => [s.key, 1]));
    const result = sumDiscoverySources([sources("2026-11-01", one)]);
    expect(result.map((r) => r.source).sort()).toEqual(DISCOVERY_SOURCES.map((s) => s.key).sort());
  });

  it("leaves out sources with no downloads", () => {
    expect(sumDiscoverySources([sources("2026-11-01", {})])).toEqual([]);
    expect(sumDiscoverySources([])).toEqual([]);
  });
});

describe("discoverySourceName", () => {
  it("returns Apple's name for each source", () => {
    expect(discoverySourceName("search")).toBe("App Store search");
    expect(discoverySourceName("appReferrer")).toBe("App referrer");
    expect(discoverySourceName("institutionalPurchase")).toBe("Institutional purchase");
  });
});

describe("sumTerritories", () => {
  it("adds up downloads and proceeds per territory, most downloads first", () => {
    const result = sumTerritories(
      [
        { date: "2026-11-01", code: "US", downloads: 10 },
        { date: "2026-11-02", code: "US", downloads: 5 },
        { date: "2026-11-01", code: "DE", downloads: 20 },
      ],
      [
        { date: "2026-11-01", code: "US", proceeds: 1.25 },
        { date: "2026-11-02", code: "US", proceeds: 2.5 },
        { date: "2026-11-01", code: "DE", proceeds: 0.99 },
      ],
    );
    expect(result).toEqual([
      { territory: "Germany", code: "DE", downloads: 20, revenue: 0.99 },
      { territory: "United States", code: "US", downloads: 15, revenue: 3.75 },
    ]);
  });

  it("includes territories with proceeds but no downloads", () => {
    const result = sumTerritories([], [{ date: "2026-11-01", code: "JP", proceeds: 4 }]);
    expect(result).toEqual([{ territory: "Japan", code: "JP", downloads: 0, revenue: 4 }]);
  });

  it("rounds proceeds to cents", () => {
    const result = sumTerritories(
      [{ date: "2026-11-01", code: "US", downloads: 1 }],
      [
        { date: "2026-11-01", code: "US", proceeds: 0.1 },
        { date: "2026-11-02", code: "US", proceeds: 0.2 },
      ],
    );
    expect(result[0].revenue).toBe(0.3);
  });

  it("falls back to the code when it isn't a region Intl knows", () => {
    const result = sumTerritories([{ date: "2026-11-01", code: "INVALID", downloads: 1 }], []);
    expect(result).toEqual([{ territory: "INVALID", code: "INVALID", downloads: 1, revenue: 0 }]);
  });

  it("falls back to the code when Intl has no name for it", () => {
    const originalOf = Intl.DisplayNames.prototype.of;
    Intl.DisplayNames.prototype.of = function (code: string) {
      return code === "QQ" ? undefined : originalOf.call(this, code);
    };
    try {
      const result = sumTerritories([{ date: "2026-11-01", code: "QQ", downloads: 3 }], []);
      expect(result[0].territory).toBe("QQ");
    } finally {
      Intl.DisplayNames.prototype.of = originalOf;
    }
  });
});
