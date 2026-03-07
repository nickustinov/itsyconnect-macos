import { describe, it, expect } from "vitest";
import { wandProps } from "@/components/magic-wand-button";

describe("wandProps", () => {
  const shared = {
    locale: "de-DE",
    baseLocale: "en-US",
    localeData: {
      "en-US": { description: "English desc", keywords: "weather,rain" },
      "de-DE": { description: "German desc", keywords: "wetter,regen" },
      "fr-FR": { description: "French desc", keywords: "météo,pluie" },
    },
    appName: "Weatherly",
    appInfoData: {
      "de-DE": { name: "Weatherly", subtitle: "Dein Wetterdienst" },
      "en-US": { name: "Weatherly", subtitle: "Your weather app" },
    },
  };

  it("returns field, locale, baseLocale, baseValue, and appName for text fields", () => {
    const result = wandProps(shared, "description");
    expect(result).toEqual({
      field: "description",
      locale: "de-DE",
      baseLocale: "en-US",
      baseValue: "English desc",
      appName: "Weatherly",
    });
  });

  it("does not include description or subtitle for non-keyword fields", () => {
    const result = wandProps(shared, "description");
    expect(result).not.toHaveProperty("description");
    expect(result).not.toHaveProperty("subtitle");
  });

  it("returns empty string when base locale has no data for the field", () => {
    const result = wandProps(shared, "whatsNew");
    expect(result.baseValue).toBe("");
  });

  it("returns empty string when base locale is missing entirely", () => {
    const sparse = { ...shared, baseLocale: "ja" };
    const result = wandProps(sparse, "description");
    expect(result.baseValue).toBe("");
  });

  it("includes description, subtitle, and otherLocaleKeywords for keywords field", () => {
    const result = wandProps(shared, "keywords");
    expect(result.field).toBe("keywords");
    expect(result.baseValue).toBe("weather,rain");
    expect(result.description).toBe("German desc");
    expect(result.subtitle).toBe("Dein Wetterdienst");
    expect(result.otherLocaleKeywords).toEqual({
      "en-US": "weather,rain",
      "fr-FR": "météo,pluie",
    });
  });

  it("excludes current locale from otherLocaleKeywords", () => {
    const result = wandProps(shared, "keywords");
    expect(result.otherLocaleKeywords).not.toHaveProperty("de-DE");
  });

  it("works without appName or appInfoData", () => {
    const noApp = { ...shared, appName: undefined, appInfoData: undefined };
    const result = wandProps(noApp, "keywords");
    expect(result.appName).toBeUndefined();
    expect(result.subtitle).toBeUndefined();
  });
});
