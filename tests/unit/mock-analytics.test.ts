import { describe, it, expect } from "vitest";
import {
  ANALYTICS_DAYS,
  DAILY_DOWNLOADS,
  DAILY_REVENUE,
  DAILY_ENGAGEMENT,
  DAILY_SESSIONS,
  DAILY_INSTALLS_DELETES,
  DAILY_DOWNLOADS_BY_SOURCE,
  DAILY_VERSION_SESSIONS,
  DAILY_OPT_IN,
  DAILY_WEB_PREVIEW,
  TERRITORIES,
  DISCOVERY_SOURCES,
  CRASHES_BY_VERSION,
  CRASHES_BY_DEVICE,
  formatDate,
  n,
  series,
  getMockAnalyticsData,
} from "@/lib/mock-analytics";

describe("mock-analytics", () => {
  describe("ANALYTICS_DAYS", () => {
    it("has 30 entries", () => {
      expect(ANALYTICS_DAYS).toHaveLength(30);
    });

    it("each entry is a YYYY-MM-DD string", () => {
      for (const day of ANALYTICS_DAYS) {
        expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it("starts on 2026-01-27", () => {
      expect(ANALYTICS_DAYS[0]).toBe("2026-01-27");
    });

    it("ends on 2026-02-25", () => {
      expect(ANALYTICS_DAYS[29]).toBe("2026-02-25");
    });
  });

  describe("daily series arrays", () => {
    const series = [
      { name: "DAILY_DOWNLOADS", data: DAILY_DOWNLOADS, fields: ["firstTime", "redownload", "update"] },
      { name: "DAILY_REVENUE", data: DAILY_REVENUE, fields: ["proceeds", "sales"] },
      { name: "DAILY_ENGAGEMENT", data: DAILY_ENGAGEMENT, fields: ["impressions", "pageViews"] },
      { name: "DAILY_SESSIONS", data: DAILY_SESSIONS, fields: ["sessions", "uniqueDevices", "avgDuration"] },
      { name: "DAILY_INSTALLS_DELETES", data: DAILY_INSTALLS_DELETES, fields: ["installs", "deletes"] },
      { name: "DAILY_DOWNLOADS_BY_SOURCE", data: DAILY_DOWNLOADS_BY_SOURCE, fields: ["search", "browse", "webReferrer", "unavailable"] },
      { name: "DAILY_VERSION_SESSIONS", data: DAILY_VERSION_SESSIONS, fields: ["v11", "v12", "v13", "v20"] },
      { name: "DAILY_OPT_IN", data: DAILY_OPT_IN, fields: ["downloading", "optingIn"] },
      { name: "DAILY_WEB_PREVIEW", data: DAILY_WEB_PREVIEW, fields: ["pageViews", "appStoreTaps"] },
    ];

    for (const { name, data, fields } of series) {
      it(`${name} has 30 entries with date + expected fields`, () => {
        expect(data).toHaveLength(30);
        for (const entry of data) {
          expect(entry).toHaveProperty("date");
          for (const field of fields) {
            expect(entry).toHaveProperty(field);
            expect(typeof (entry as Record<string, unknown>)[field]).toBe("number");
          }
        }
      });
    }
  });

  describe("static data", () => {
    it("TERRITORIES has entries with required fields", () => {
      expect(TERRITORIES.length).toBeGreaterThan(0);
      for (const t of TERRITORIES) {
        expect(t).toHaveProperty("territory");
        expect(t).toHaveProperty("code");
        expect(t).toHaveProperty("downloads");
        expect(t).toHaveProperty("revenue");
      }
    });

    it("DISCOVERY_SOURCES has entries with required fields", () => {
      expect(DISCOVERY_SOURCES.length).toBeGreaterThan(0);
      for (const s of DISCOVERY_SOURCES) {
        expect(s).toHaveProperty("source");
        expect(s).toHaveProperty("count");
        expect(s).toHaveProperty("fill");
      }
    });

    it("CRASHES_BY_VERSION has entries with required fields", () => {
      expect(CRASHES_BY_VERSION.length).toBeGreaterThan(0);
      for (const c of CRASHES_BY_VERSION) {
        expect(c).toHaveProperty("version");
        expect(c).toHaveProperty("platform");
        expect(c).toHaveProperty("crashes");
        expect(c).toHaveProperty("uniqueDevices");
      }
    });

    it("CRASHES_BY_DEVICE has entries with required fields", () => {
      expect(CRASHES_BY_DEVICE.length).toBeGreaterThan(0);
      for (const c of CRASHES_BY_DEVICE) {
        expect(c).toHaveProperty("device");
        expect(c).toHaveProperty("crashes");
        expect(c).toHaveProperty("uniqueDevices");
      }
    });
  });

  describe("n (deterministic noise)", () => {
    it("returns a number in [-1, 1]", () => {
      for (let i = 0; i < 50; i++) {
        const val = n(i, 42);
        expect(val).toBeGreaterThanOrEqual(-1);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it("is deterministic – same inputs produce same output", () => {
      expect(n(5, 10)).toBe(n(5, 10));
    });

    it("produces different values for different seeds", () => {
      expect(n(0, 1)).not.toBe(n(0, 2));
    });
  });

  describe("series", () => {
    it("returns an array of length ANALYTICS_DAYS (30)", () => {
      const result = series(100, 10, 1);
      expect(result).toHaveLength(30);
    });

    it("values are non-negative integers", () => {
      const result = series(50, 20, 7);
      for (const v of result) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(v)).toBe(true);
      }
    });

    it("applies upward trend", () => {
      const result = series(100, 0, 99, 10);
      // With zero variance, values should increase linearly
      expect(result[29]).toBeGreaterThan(result[0]);
    });
  });

  describe("getMockAnalyticsData", () => {
    it("returns all expected fields as non-null", () => {
      const data = getMockAnalyticsData("app-001");
      expect(data.dailyDownloads).toBe(DAILY_DOWNLOADS);
      expect(data.dailyRevenue).toBe(DAILY_REVENUE);
      expect(data.dailyEngagement).toBe(DAILY_ENGAGEMENT);
      expect(data.dailySessions).toBe(DAILY_SESSIONS);
      expect(data.dailyInstallsDeletes).toBe(DAILY_INSTALLS_DELETES);
      expect(data.dailyDownloadsBySource).toBe(DAILY_DOWNLOADS_BY_SOURCE);
      expect(data.dailyVersionSessions).toBe(DAILY_VERSION_SESSIONS);
      expect(data.dailyOptIn).toBe(DAILY_OPT_IN);
      expect(data.dailyWebPreview).toBe(DAILY_WEB_PREVIEW);
      expect(data.territories).toBe(TERRITORIES);
      expect(data.discoverySources).toBe(DISCOVERY_SOURCES);
      expect(data.crashesByVersion).toBe(CRASHES_BY_VERSION);
      expect(data.crashesByDevice).toBe(CRASHES_BY_DEVICE);
    });

    it("has all expected keys", () => {
      const data = getMockAnalyticsData("app-001");
      const keys = Object.keys(data);
      expect(keys).toHaveLength(14);
    });
  });

  describe("formatDate", () => {
    it("formats a date string as 'day month'", () => {
      const result = formatDate("2026-01-27");
      expect(result).toBe("27 Jan");
    });

    it("formats mid-year date", () => {
      const result = formatDate("2026-06-15");
      expect(result).toBe("15 Jun");
    });
  });
});
