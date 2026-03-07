import { describe, it, expect } from "vitest";
import {
  buildTranslatePrompt,
  buildImprovePrompt,
  buildFixKeywordsPrompt,
  buildReplyPrompt,
  buildAppealPrompt,
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
