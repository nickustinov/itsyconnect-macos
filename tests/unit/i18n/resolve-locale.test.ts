import { describe, it, expect } from "vitest";
import { matchSupportedLocale, resolveLocale } from "@/lib/i18n/resolve-locale";

describe("matchSupportedLocale", () => {
  it("matches Simplified Chinese tags", () => {
    expect(matchSupportedLocale("zh-CN")).toBe("zh-CN");
    expect(matchSupportedLocale("zh-Hans")).toBe("zh-CN");
    expect(matchSupportedLocale("zh-Hans-CN")).toBe("zh-CN");
    expect(matchSupportedLocale("zh")).toBe("zh-CN");
  });

  it("does not match Traditional Chinese and regional variants", () => {
    expect(matchSupportedLocale("zh-TW")).toBeNull();
    expect(matchSupportedLocale("zh-HK")).toBeNull();
    expect(matchSupportedLocale("zh-MO")).toBeNull();
    expect(matchSupportedLocale("zh-Hant")).toBeNull();
  });

  it("matches English tags", () => {
    expect(matchSupportedLocale("en")).toBe("en");
    expect(matchSupportedLocale("en-US")).toBe("en");
    expect(matchSupportedLocale("en-GB")).toBe("en");
  });

  it("matches French, German and Russian tags", () => {
    expect(matchSupportedLocale("fr")).toBe("fr");
    expect(matchSupportedLocale("fr-FR")).toBe("fr");
    expect(matchSupportedLocale("fr-CA")).toBe("fr");
    expect(matchSupportedLocale("de")).toBe("de");
    expect(matchSupportedLocale("de-AT")).toBe("de");
    expect(matchSupportedLocale("ru")).toBe("ru");
    expect(matchSupportedLocale("ru-RU")).toBe("ru");
  });

  it("returns null for unsupported locales", () => {
    expect(matchSupportedLocale("it")).toBeNull();
    expect(matchSupportedLocale("ko-KR")).toBeNull();
  });
});

describe("resolveLocale", () => {
  it("forces the explicit preference", () => {
    expect(resolveLocale("en", "zh-CN")).toBe("en");
    expect(resolveLocale("zh-CN", "en-US")).toBe("zh-CN");
    expect(resolveLocale("fr", "en-US")).toBe("fr");
    expect(resolveLocale("de", "en-US")).toBe("de");
    expect(resolveLocale("ru", "en-US")).toBe("ru");
  });

  it("uses the first supported system locale", () => {
    expect(resolveLocale("system", "zh-CN")).toBe("zh-CN");
    expect(resolveLocale("system", "en-US")).toBe("en");
    expect(resolveLocale("system", "fr-FR")).toBe("fr");
  });

  it("falls back to English when system locale has no match", () => {
    expect(resolveLocale("system", "it")).toBe("en");
    expect(resolveLocale("system", "zh-TW")).toBe("en");
  });

  it("walks comma-separated locale lists", () => {
    expect(resolveLocale("system", "it,zh-CN,en-US")).toBe("zh-CN");
    expect(resolveLocale("system", "it,de,en-US")).toBe("de");
    expect(resolveLocale("system", "it,ko,en-US")).toBe("en");
  });
});

describe("Japanese locale", () => {
  it("matches ja and regional variants", () => {
    expect(matchSupportedLocale("ja")).toBe("ja");
    expect(matchSupportedLocale("ja-JP")).toBe("ja");
    expect(matchSupportedLocale("JA_jp")).toBe("ja");
  });

  it("resolves system preference to ja for a Japanese system locale", () => {
    expect(resolveLocale("system", "ja-JP")).toBe("ja");
  });
});
