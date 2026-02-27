import { describe, it, expect } from "vitest";
import { LOCALE_NAMES, localeName, FIELD_LIMITS } from "@/lib/asc/locale-names";

describe("locale-names", () => {
  describe("LOCALE_NAMES", () => {
    it("is a non-empty record", () => {
      expect(Object.keys(LOCALE_NAMES).length).toBeGreaterThan(0);
    });

    it("maps known locale codes to display names", () => {
      expect(LOCALE_NAMES["en-US"]).toBe("English (US)");
      expect(LOCALE_NAMES["de-DE"]).toBe("German");
      expect(LOCALE_NAMES["ja"]).toBe("Japanese");
    });
  });

  describe("localeName", () => {
    it("returns the display name for a known locale", () => {
      expect(localeName("en-US")).toBe("English (US)");
      expect(localeName("fr-FR")).toBe("French (France)");
    });

    it("returns the locale code itself for an unknown locale", () => {
      expect(localeName("xx-YY")).toBe("xx-YY");
      expect(localeName("unknown")).toBe("unknown");
    });
  });

  describe("FIELD_LIMITS", () => {
    it("has expected fields", () => {
      expect(FIELD_LIMITS.name).toBe(30);
      expect(FIELD_LIMITS.subtitle).toBe(30);
      expect(FIELD_LIMITS.description).toBe(4000);
      expect(FIELD_LIMITS.keywords).toBe(100);
      expect(FIELD_LIMITS.whatsNew).toBe(4000);
      expect(FIELD_LIMITS.promotionalText).toBe(170);
      expect(FIELD_LIMITS.supportUrl).toBe(2048);
      expect(FIELD_LIMITS.marketingUrl).toBe(2048);
    });

    it("all values are positive numbers", () => {
      for (const value of Object.values(FIELD_LIMITS)) {
        expect(typeof value).toBe("number");
        expect(value).toBeGreaterThan(0);
      }
    });
  });
});
