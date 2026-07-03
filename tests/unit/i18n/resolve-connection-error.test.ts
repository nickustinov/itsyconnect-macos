import { describe, expect, it } from "vitest";
import { resolveConnectionErrorMessage } from "@/lib/i18n/resolve-connection-error";
import type { ConnectionError } from "@/lib/apps-context";
import { en } from "@/lib/i18n/locales/en";
import { getMessages, translate } from "@/lib/i18n/messages";

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate(getMessages("en"), key, params);

describe("resolveConnectionErrorMessage", () => {
  it("uses key for client-side fallbacks", () => {
    const error: ConnectionError = {
      category: "network",
      message: "",
      key: "connectionErrors.networkFailed",
    };
    expect(resolveConnectionErrorMessage(error, t)).toBe(en.connectionErrors.networkFailed);
  });

  it("maps known ASC server messages", () => {
    const error: ConnectionError = {
      category: "auth",
      message: "API key may be invalid or expired",
    };
    expect(resolveConnectionErrorMessage(error, t)).toBe(en.connectionErrors.authInvalid);
  });

  it("parses ASC status error pattern", () => {
    const error: ConnectionError = {
      category: "api",
      message: "App Store Connect returned an error (422)",
    };
    expect(resolveConnectionErrorMessage(error, t)).toBe(
      translate(getMessages("en"), "connectionErrors.ascError", { status: 422 }),
    );
  });

  it("passes through unknown ASC detail text", () => {
    const error: ConnectionError = {
      category: "api",
      message: "The provided entity is missing a required attribute",
    };
    expect(resolveConnectionErrorMessage(error, t)).toBe(
      "The provided entity is missing a required attribute",
    );
  });
});
