import { describe, it, expect } from "vitest";
import { resolveLocaleFromRequest } from "@/lib/i18n/locale-cookies";

describe("resolveLocaleFromRequest", () => {
  it("prefers the resolved locale cookie", () => {
    expect(
      resolveLocaleFromRequest({
        resolvedCookie: "zh-CN",
        prefCookie: "en",
        acceptLanguage: "en-US",
      }),
    ).toBe("zh-CN");
  });

  it("uses the preference cookie when resolved cookie is absent", () => {
    expect(
      resolveLocaleFromRequest({
        prefCookie: "zh-CN",
        acceptLanguage: "en-US",
      }),
    ).toBe("zh-CN");
  });

  it("falls back to Accept-Language for system preference", () => {
    expect(
      resolveLocaleFromRequest({
        acceptLanguage: "zh-CN,en;q=0.9",
      }),
    ).toBe("zh-CN");
  });

  it("defaults to English when nothing matches", () => {
    expect(resolveLocaleFromRequest({})).toBe("en");
    expect(
      resolveLocaleFromRequest({ acceptLanguage: "fr-FR" }),
    ).toBe("en");
  });
});
