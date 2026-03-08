import { describe, it, expect } from "vitest";
import {
  buildTranslatePrompt,
  buildImprovePrompt,
  buildFixKeywordsPrompt,
  buildReplyPrompt,
  buildAppealPrompt,
  buildAnalyticsInsightsPrompt,
} from "@/lib/ai/prompts";

describe("buildTranslatePrompt", () => {
  it("includes source text, locale names, and field context", () => {
    const prompt = buildTranslatePrompt(
      "Download now and enjoy!",
      "en-US",
      "de-DE",
      { field: "description", appName: "Weatherly", charLimit: 4000 },
    );

    expect(prompt).toContain("Download now and enjoy!");
    expect(prompt).toContain("English (US)");
    expect(prompt).toContain("German");
    expect(prompt).toContain("app description");
    expect(prompt).toContain("Weatherly");
    expect(prompt).toContain("4000");
  });

  it("works without optional context fields", () => {
    const prompt = buildTranslatePrompt(
      "Hello world",
      "en-US",
      "ja",
      { field: "whatsNew" },
    );

    expect(prompt).toContain("Hello world");
    expect(prompt).toContain("Japanese");
    expect(prompt).toContain("release notes");
    expect(prompt).not.toContain("app is called");
    expect(prompt).not.toContain("must not exceed");
  });

  it("uses the field name as-is for unknown fields", () => {
    const prompt = buildTranslatePrompt(
      "Hello",
      "en-US",
      "de-DE",
      { field: "unknownField" },
    );

    expect(prompt).toContain("unknownField");
  });

  it("includes keyword-specific guidance for keywords field", () => {
    const prompt = buildTranslatePrompt(
      "weather,forecast,rain",
      "en-US",
      "fr-FR",
      { field: "keywords" },
    );

    expect(prompt).toContain("comma-separated");
  });

  it("excludes keyword-specific guidance for non-keyword fields", () => {
    const prompt = buildTranslatePrompt(
      "Download now and enjoy!",
      "en-US",
      "de-DE",
      { field: "description" },
    );

    expect(prompt).not.toContain("comma-separated");
  });

  it("handles empty text", () => {
    const prompt = buildTranslatePrompt(
      "",
      "en-US",
      "es-ES",
      { field: "description" },
    );

    expect(prompt).toContain("app description");
    expect(prompt).toContain("Spanish (Spain)");
  });
});

describe("buildImprovePrompt", () => {
  it("includes text, locale, ASO guidance, and char limit", () => {
    const prompt = buildImprovePrompt(
      "A simple weather app.",
      "en-US",
      { field: "description", appName: "Weatherly", charLimit: 4000 },
    );

    expect(prompt).toContain("A simple weather app.");
    expect(prompt).toContain("English (US)");
    expect(prompt).toContain("App Store search discoverability");
    expect(prompt).toContain("Weatherly");
    expect(prompt).toContain("4000");
  });

  it("works without optional context fields", () => {
    const prompt = buildImprovePrompt(
      "Bug fixes.",
      "ja",
      { field: "whatsNew" },
    );

    expect(prompt).toContain("Bug fixes.");
    expect(prompt).toContain("Japanese");
    expect(prompt).not.toContain("app is called");
    expect(prompt).not.toContain("must not exceed");
  });

  it("handles empty text", () => {
    const prompt = buildImprovePrompt(
      "",
      "en-US",
      { field: "promotionalText" },
    );

    expect(prompt).toContain("promotional text");
  });
});

describe("buildFixKeywordsPrompt", () => {
  it("includes locale, app context, forbidden words, and existing keywords", () => {
    const prompt = buildFixKeywordsPrompt(
      "rain,humidity",
      "de-DE",
      ["weather", "forecast"],
      { field: "keywords", appName: "Weatherly", description: "Check the weather.", subtitle: "Your daily forecast" },
    );

    expect(prompt).toContain("German");
    expect(prompt).toContain("de-DE");
    expect(prompt).toContain("Weatherly");
    expect(prompt).toContain("Your daily forecast");
    expect(prompt).toContain("Check the weather.");
    expect(prompt).toContain("rain,humidity");
    expect(prompt).toContain("weather, forecast");
    expect(prompt).toContain("100");
  });

  it("works without subtitle or description", () => {
    const prompt = buildFixKeywordsPrompt(
      "rain",
      "ja",
      [],
      { field: "keywords", appName: "Photon" },
    );

    expect(prompt).toContain("Japanese");
    expect(prompt).toContain("Photon");
    expect(prompt).not.toContain("Subtitle:");
    expect(prompt).not.toContain("App description for context");
  });

  it("handles empty keywords", () => {
    const prompt = buildFixKeywordsPrompt(
      "",
      "en-US",
      ["existing"],
      { field: "keywords" },
    );

    expect(prompt).toContain("English (US)");
    expect(prompt).not.toContain("Keep these:");
  });
});

describe("buildReplyPrompt", () => {
  it("includes rating, review content, and style rules", () => {
    const prompt = buildReplyPrompt(
      "Great app!",
      "I love the weather forecasts.",
      5,
      "Weatherly",
    );

    expect(prompt).toContain("5-star");
    expect(prompt).toContain("Great app!");
    expect(prompt).toContain("I love the weather forecasts.");
    expect(prompt).toContain("Weatherly");
    expect(prompt).toContain("en dashes");
  });

  it("works without appName", () => {
    const prompt = buildReplyPrompt("Bad", "Crashes a lot", 1);
    expect(prompt).toContain("1-star");
    expect(prompt).toContain("Crashes a lot");
    expect(prompt).not.toContain("app is called");
  });
});

describe("buildAppealPrompt", () => {
  it("includes rating, review content, and guideline references", () => {
    const prompt = buildAppealPrompt(
      "Fake review",
      "This app is terrible, competitor spam.",
      1,
      "Weatherly",
    );

    expect(prompt).toContain("1-star");
    expect(prompt).toContain("Fake review");
    expect(prompt).toContain("competitor");
    expect(prompt).toContain("Weatherly");
    expect(prompt).toContain("App Store Review Guidelines");
  });

  it("works without appName", () => {
    const prompt = buildAppealPrompt("Spam", "Buy my product instead", 1);
    expect(prompt).toContain("1-star");
    expect(prompt).toContain("Buy my product instead");
    expect(prompt).not.toContain("app is called");
  });
});

describe("buildAnalyticsInsightsPrompt", () => {
  const makeData = (overrides = {}) => ({
    dailyDownloads: [
      { date: "2026-03-01", firstTime: 100, redownload: 20, update: 50 },
      { date: "2026-03-02", firstTime: 120, redownload: 25, update: 55 },
      { date: "2026-03-03", firstTime: 90, redownload: 15, update: 40 },
      { date: "2026-03-04", firstTime: 150, redownload: 30, update: 60 },
      { date: "2026-03-05", firstTime: 200, redownload: 40, update: 70 },
      { date: "2026-03-06", firstTime: 180, redownload: 35, update: 65 },
    ],
    dailyRevenue: [
      { date: "2026-03-01", proceeds: 500, sales: 600 },
      { date: "2026-03-02", proceeds: 550, sales: 650 },
      { date: "2026-03-03", proceeds: 400, sales: 480 },
      { date: "2026-03-04", proceeds: 700, sales: 800 },
      { date: "2026-03-05", proceeds: 900, sales: 1000 },
      { date: "2026-03-06", proceeds: 850, sales: 950 },
    ],
    dailyEngagement: [
      { date: "2026-03-01", impressions: 5000, pageViews: 1000 },
      { date: "2026-03-02", impressions: 5500, pageViews: 1100 },
      { date: "2026-03-03", impressions: 4000, pageViews: 800 },
      { date: "2026-03-04", impressions: 6000, pageViews: 1200 },
      { date: "2026-03-05", impressions: 7000, pageViews: 1400 },
      { date: "2026-03-06", impressions: 6500, pageViews: 1300 },
    ],
    dailySessions: [
      { date: "2026-03-01", sessions: 2000, uniqueDevices: 1500, avgDuration: 120 },
      { date: "2026-03-02", sessions: 2100, uniqueDevices: 1600, avgDuration: 115 },
    ],
    dailyInstallsDeletes: [
      { date: "2026-03-01", installs: 100, deletes: 10 },
      { date: "2026-03-02", installs: 110, deletes: 15 },
    ],
    dailyDownloadsBySource: [],
    dailyTerritoryDownloads: [],
    dailyCrashes: [
      { date: "2026-03-01", crashes: 5, uniqueDevices: 3 },
      { date: "2026-03-02", crashes: 8, uniqueDevices: 6 },
    ],
    territories: [
      { territory: "United States", code: "US", downloads: 500, revenue: 2000 },
      { territory: "Germany", code: "DE", downloads: 200, revenue: 800 },
    ],
    discoverySources: [
      { source: "Search", count: 300 },
      { source: "Browse", count: 150 },
    ],
    crashesByVersion: [
      { version: "2.1.0", platform: "iOS", crashes: 10, uniqueDevices: 8 },
    ],
    ...overrides,
  });

  it("includes period dates and download totals", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData());

    expect(prompt).toContain("2026-03-01");
    expect(prompt).toContain("2026-03-06");
    expect(prompt).toContain("6 days");
    expect(prompt).toContain("840"); // 100+120+90+150+200+180 first-time
  });

  it("includes revenue data", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData());

    expect(prompt).toContain("proceeds");
    expect(prompt).toContain("sales");
  });

  it("includes conversion funnel metrics", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData());

    expect(prompt).toContain("impressions");
    expect(prompt).toContain("page views");
    expect(prompt).toContain("first-time downloads");
  });

  it("includes territory data", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData());

    expect(prompt).toContain("United States");
    expect(prompt).toContain("Germany");
  });

  it("includes crash data", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData());

    expect(prompt).toContain("Crashes");
    expect(prompt).toContain("2.1.0");
  });

  it("includes discovery sources", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData());

    expect(prompt).toContain("Search");
    expect(prompt).toContain("Browse");
  });

  it("includes sessions and duration", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData());

    expect(prompt).toContain("Sessions");
    expect(prompt).toContain("avg duration");
  });

  it("includes download trend comparison", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData());

    expect(prompt).toContain("Download trend");
    expect(prompt).toContain("%");
  });

  it("handles minimal data without crashing", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData({
      dailyRevenue: [],
      dailyEngagement: [],
      dailySessions: [],
      dailyInstallsDeletes: [],
      dailyCrashes: [],
      territories: [],
      discoverySources: [],
      crashesByVersion: [],
    }));

    expect(prompt).toContain("2026-03-01");
    expect(prompt).not.toContain("Crashes");
    expect(prompt).not.toContain("Sessions");
  });

  it("handles empty downloads array", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData({
      dailyDownloads: [],
    }));

    expect(prompt).toContain("No data available");
  });

  it("includes installs and deletions when present", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData());

    expect(prompt).toContain("Installs");
    expect(prompt).toContain("Deletions");
  });

  it("contains instruction rules for the AI", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData());

    expect(prompt).toContain("3–5 highlights");
    expect(prompt).toContain("2–4 opportunities");
    expect(prompt).toContain("actionable");
  });
});
