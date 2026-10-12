import { describe, it, expect } from "vitest";
import { LANGUAGE_OPTIONS } from "@/app/settings/appearance/language-options";
import { SUPPORTED_LOCALES } from "@/lib/i18n/types";
import { getByPath, getMessages } from "@/lib/i18n/messages";

describe("language picker options", () => {
  it("offers the system preference plus every supported locale, in order", () => {
    expect(LANGUAGE_OPTIONS.map((option) => option.value)).toEqual([
      "system",
      ...SUPPORTED_LOCALES,
    ]);
  });

  it("resolves every option label in every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const messages = getMessages(locale);
      for (const { labelKey } of LANGUAGE_OPTIONS) {
        expect(getByPath(messages, labelKey), `${locale} → ${labelKey}`).toBeTruthy();
      }
    }
  });

  it("labels Japanese with its endonym in every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(getMessages(locale).settings.appearance.languageJa).toBe("日本語");
    }
  });
});
