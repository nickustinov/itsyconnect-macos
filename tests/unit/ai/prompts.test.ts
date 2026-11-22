import { describe, it, expect } from "vitest";
import {
  buildTranslatePrompt,
  buildImprovePrompt,
  buildFixKeywordsPrompt,
  buildReplyPrompt,
  buildAppealPrompt,
  buildAnalyticsInsightsPrompt,
  buildInsightsPrompt,
  buildIncrementalInsightsPrompt,
  buildNominationPrompt,
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

  it("truncates long descriptions over 500 characters", () => {
    const longDesc = "A".repeat(600);
    const prompt = buildFixKeywordsPrompt(
      "rain",
      "en-US",
      [],
      { field: "keywords", appName: "TestApp", description: longDesc },
    );

    expect(prompt).toContain("...");
    expect(prompt).not.toContain("A".repeat(600));
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
    dailyDownloadsBySource: [
      {
        date: "2026-03-01",
        search: 200,
        browse: 100,
        appReferrer: 0,
        webReferrer: 0,
        appClip: 0,
        institutionalPurchase: 0,
        unavailable: 0,
      },
      {
        date: "2026-03-02",
        search: 100,
        browse: 50,
        appReferrer: 30,
        webReferrer: 0,
        appClip: 0,
        institutionalPurchase: 0,
        unavailable: 0,
      },
    ],
    dailyTerritoryDownloads: [
      { date: "2026-03-01", code: "US", downloads: 300 },
      { date: "2026-03-02", code: "US", downloads: 200 },
      { date: "2026-03-01", code: "DE", downloads: 200 },
    ],
    dailyTerritoryRevenue: [],
    dailyCrashes: [
      { date: "2026-03-01", crashes: 5, uniqueDevices: 3 },
      { date: "2026-03-02", crashes: 8, uniqueDevices: 6 },
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

    expect(prompt).toContain("Top territories by downloads: United States (500), Germany (200)");
  });

  it("includes crash data", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData());

    expect(prompt).toContain("Crashes");
    expect(prompt).toContain("2.1.0");
  });

  it("includes discovery sources", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData());

    expect(prompt).toContain(
      "Discovery sources: App Store search: 300 (63%), App Store browse: 150 (31%), App referrer: 30 (6%)",
    );
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
      dailyDownloadsBySource: [],
      dailyTerritoryDownloads: [],
      crashesByVersion: [],
    }));

    expect(prompt).toContain("2026-03-01");
    expect(prompt).not.toContain("Crashes");
    expect(prompt).not.toContain("Sessions");
  });

  it("handles zero impressions without conversion funnel", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData({
      dailyEngagement: [
        { date: "2026-03-01", impressions: 0, pageViews: 0 },
      ],
    }));

    expect(prompt).not.toContain("Conversion funnel");
  });

  it("handles impressions > 0 but pageViews === 0 (downloadRate fallback)", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData({
      dailyEngagement: [
        { date: "2026-03-01", impressions: 500, pageViews: 0 },
      ],
    }));

    expect(prompt).toContain("Conversion funnel");
    expect(prompt).toContain("0 page views");
  });

  it("handles zero revenue", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData({
      dailyRevenue: [
        { date: "2026-03-01", proceeds: 0, sales: 0 },
      ],
    }));

    expect(prompt).not.toContain("Revenue");
  });

  it("handles zero sessions", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData({
      dailySessions: [
        { date: "2026-03-01", sessions: 0, uniqueDevices: 0, avgDuration: 0 },
      ],
    }));

    expect(prompt).not.toContain("Sessions");
  });

  it("handles zero installs and deletes", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData({
      dailyInstallsDeletes: [
        { date: "2026-03-01", installs: 0, deletes: 0 },
      ],
    }));

    expect(prompt).not.toContain("Installs");
  });

  it("omits download trend when fewer than 6 days", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData({
      dailyDownloads: [
        { date: "2026-03-01", firstTime: 100, redownload: 20, update: 50 },
        { date: "2026-03-02", firstTime: 120, redownload: 25, update: 55 },
      ],
    }));

    expect(prompt).not.toContain("Download trend");
  });

  it("handles pageViews > 0 but 0 downloads for conversion rate", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData({
      dailyDownloads: [
        { date: "2026-03-01", firstTime: 0, redownload: 0, update: 0 },
        { date: "2026-03-02", firstTime: 0, redownload: 0, update: 0 },
        { date: "2026-03-03", firstTime: 0, redownload: 0, update: 0 },
        { date: "2026-03-04", firstTime: 0, redownload: 0, update: 0 },
        { date: "2026-03-05", firstTime: 0, redownload: 0, update: 0 },
        { date: "2026-03-06", firstTime: 0, redownload: 0, update: 0 },
      ],
      dailyEngagement: [
        { date: "2026-03-01", impressions: 100, pageViews: 50 },
      ],
    }));

    expect(prompt).toContain("Conversion funnel");
    expect(prompt).toContain("0%");
  });

  it("handles empty discovery sources and territories", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData({
      dailyDownloadsBySource: [],
      dailyTerritoryDownloads: [],
    }));

    expect(prompt).not.toContain("Discovery sources");
    expect(prompt).not.toContain("Top territories");
  });

  it("handles crashes with no crashesByVersion", () => {
    const prompt = buildAnalyticsInsightsPrompt(makeData({
      dailyCrashes: [
        { date: "2026-03-01", crashes: 5, uniqueDevices: 3 },
      ],
      crashesByVersion: [],
    }));

    expect(prompt).toContain("Crashes");
    expect(prompt).not.toContain("By version");
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

describe("buildInsightsPrompt", () => {
  it("includes reviews and app name", () => {
    const prompt = buildInsightsPrompt(
      [{ rating: 5, title: "Great", body: "Love it" }],
      "Weatherly",
    );

    expect(prompt).toContain("Weatherly");
    expect(prompt).toContain("[5/5] Great: Love it");
    expect(prompt).toContain("Strengths");
    expect(prompt).toContain("Weaknesses");
    expect(prompt).toContain("Potential");
  });

  it("works without appName", () => {
    const prompt = buildInsightsPrompt(
      [{ rating: 3, title: "OK", body: "Decent app" }],
    );

    expect(prompt).not.toContain("app is called");
    expect(prompt).toContain("[3/5] OK: Decent app");
  });
});

describe("buildIncrementalInsightsPrompt", () => {
  it("includes existing insights, new reviews, and correct grammar", () => {
    const prompt = buildIncrementalInsightsPrompt(
      [{ rating: 4, title: "Nice", body: "Good update" }],
      {
        strengths: ["Fast performance"],
        weaknesses: ["Battery drain"],
        potential: ["Add widgets"],
      },
      11,
    );

    expect(prompt).toContain("10 App Store reviews");
    expect(prompt).toContain("- Fast performance");
    expect(prompt).toContain("- Battery drain");
    expect(prompt).toContain("- Add widgets");
    expect(prompt).toContain("[4/5] Nice: Good update");
    // Singular grammar for 1 new review
    expect(prompt).toContain("1 new review has");
  });

  it("uses plural grammar for multiple new reviews", () => {
    const prompt = buildIncrementalInsightsPrompt(
      [
        { rating: 5, title: "A", body: "B" },
        { rating: 3, title: "C", body: "D" },
      ],
      { strengths: [], weaknesses: [], potential: [] },
      5,
    );

    expect(prompt).toContain("2 new reviews have");
  });
});

describe("buildNominationPrompt", () => {
  it("includes all fields", () => {
    const prompt = buildNominationPrompt({
      appName: "Weatherly",
      versionString: "2.1.0",
      whatsNew: "New radar feature",
      promotionalText: "Best weather app",
      description: "Check the weather easily.",
      isLaunch: false,
    });

    expect(prompt).toContain("Weatherly");
    expect(prompt).toContain("2.1.0");
    expect(prompt).toContain("New radar feature");
    expect(prompt).toContain("Best weather app");
    expect(prompt).toContain("Check the weather easily.");
    expect(prompt).toContain("app update");
  });

  it("truncates long descriptions over 1500 characters", () => {
    const longDesc = "B".repeat(2000);
    const prompt = buildNominationPrompt({
      versionString: "1.0",
      whatsNew: "Launch",
      promotionalText: "",
      description: longDesc,
      isLaunch: true,
    });

    expect(prompt).toContain("...");
    expect(prompt).not.toContain("B".repeat(2000));
    expect(prompt).toContain("app launch");
  });

  it("omits whatsNew and promotionalText when empty", () => {
    const prompt = buildNominationPrompt({
      appName: "TestApp",
      versionString: "1.0",
      whatsNew: "",
      promotionalText: "",
      description: "A great app.",
      isLaunch: true,
    });

    expect(prompt).not.toContain("What's new");
    expect(prompt).not.toContain("Promotional text");
    expect(prompt).toContain("A great app.");
  });

  it("includes description section when description is provided", () => {
    const prompt = buildNominationPrompt({
      versionString: "1.0",
      whatsNew: "",
      promotionalText: "",
      description: "A powerful weather app.",
      isLaunch: false,
    });

    expect(prompt).toContain("App description:");
    expect(prompt).toContain("A powerful weather app.");
  });

  it("omits description section when description is empty", () => {
    const prompt = buildNominationPrompt({
      versionString: "1.0",
      whatsNew: "Bug fixes",
      promotionalText: "",
      description: "",
      isLaunch: false,
    });

    expect(prompt).not.toContain("App description:");
  });
});
