import { describe, it, expect } from "vitest";
import { matchSupportedLocale, resolveLocale } from "@/lib/i18n/resolve-locale";

describe("matchSupportedLocale", () => {
  it("matches Simplified Chinese tags", () => {
    expect(matchSupportedLocale("zh-CN")).toBe("zh-CN");
    expect(matchSupportedLocale("zh-Hans")).toBe("zh-CN");
    expect(matchSupportedLocale("zh")).toBe("zh-CN");
  });

  it("does not match Traditional Chinese tags", () => {
    expect(matchSupportedLocale("zh-TW")).toBeNull();
    expect(matchSupportedLocale("zh-HK")).toBeNull();
    expect(matchSupportedLocale("zh-Hant")).toBeNull();
  });

  it("matches English tags", () => {
    expect(matchSupportedLocale("en")).toBe("en");
    expect(matchSupportedLocale("en-US")).toBe("en");
    expect(matchSupportedLocale("en-GB")).toBe("en");
  });

  it("returns null for unsupported locales", () => {
    expect(matchSupportedLocale("fr-FR")).toBeNull();
    expect(matchSupportedLocale("ja")).toBeNull();
  });
});

describe("resolveLocale", () => {
  it("forces en when preference is en", () => {
    expect(resolveLocale("en", "zh-CN")).toBe("en");
  });

  it("forces zh-CN when preference is zh-CN", () => {
    expect(resolveLocale("zh-CN", "en-US")).toBe("zh-CN");
  });

  it("uses the first supported system locale", () => {
    expect(resolveLocale("system", "zh-CN")).toBe("zh-CN");
    expect(resolveLocale("system", "en-US")).toBe("en");
  });

  it("falls back to English when system locale has no match", () => {
    expect(resolveLocale("system", "fr-FR")).toBe("en");
    expect(resolveLocale("system", "zh-TW")).toBe("en");
  });

  it("walks comma-separated locale lists", () => {
    expect(resolveLocale("system", "fr-FR,zh-CN,en-US")).toBe("zh-CN");
    expect(resolveLocale("system", "ja,de,en-US")).toBe("en");
  });
});
