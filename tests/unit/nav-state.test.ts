import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
});

import {
  clearNavigation,
  saveNavigation,
  getLastUrl,
  getLastAppId,
  getAppState,
} from "@/lib/nav-state";

describe("nav-state", () => {
  beforeEach(() => {
    store.clear();
  });

  describe("saveNavigation", () => {
    it("saves lastUrl and per-app subpath", () => {
      saveNavigation("/dashboard/apps/app-1/details", "");
      expect(getLastUrl()).toBe("/dashboard/apps/app-1/details");
      expect(getAppState("app-1")).toBe("/details");
    });

    it("saves search params as suffix", () => {
      saveNavigation("/dashboard/apps/app-1/store-listing", "version=v1&locale=en");
      expect(getLastUrl()).toBe("/dashboard/apps/app-1/store-listing?version=v1&locale=en");
      expect(getAppState("app-1")).toBe("/store-listing?version=v1&locale=en");
    });

    it("saves portfolio path", () => {
      saveNavigation("/dashboard", "");
      expect(getLastUrl()).toBe("/dashboard");
    });

    it("portfolio does not clear lastAppId from earlier navigation", () => {
      saveNavigation("/dashboard/apps/app-1/details", "");
      expect(getLastAppId()).toBe("app-1");
      saveNavigation("/dashboard", "");
      expect(getLastUrl()).toBe("/dashboard");
      expect(getLastAppId()).toBe("app-1");
      expect(getAppState("app-1")).toBe("/details");
    });

    it("skips saving when entry param is present", () => {
      saveNavigation("/dashboard/apps/app-1/details", "");
      saveNavigation("/dashboard", "entry=1");
      expect(getLastUrl()).toBe("/dashboard/apps/app-1/details");
    });

    it("ignores non-dashboard paths", () => {
      saveNavigation("/settings/license", "");
      expect(getLastUrl()).toBeUndefined();
    });

    it("handles app root (no subpath)", () => {
      saveNavigation("/dashboard/apps/app-2", "");
      expect(getLastUrl()).toBe("/dashboard/apps/app-2");
      expect(getAppState("app-2")).toBe("");
    });

    it("saves lastUrl but skips per-app state for empty appId", () => {
      saveNavigation("/dashboard/apps/", "");
      expect(getLastUrl()).toBe("/dashboard/apps/");
      expect(getAppState("")).toBeUndefined();
    });

    it("preserves state for multiple apps", () => {
      saveNavigation("/dashboard/apps/app-1/details", "");
      saveNavigation("/dashboard/apps/app-2/reviews", "");
      expect(getAppState("app-1")).toBe("/details");
      expect(getAppState("app-2")).toBe("/reviews");
      expect(getLastUrl()).toBe("/dashboard/apps/app-2/reviews");
    });
  });

  describe("getLastUrl", () => {
    it("returns undefined when nothing saved", () => {
      expect(getLastUrl()).toBeUndefined();
    });

    it("returns undefined for non-dashboard URLs in storage", () => {
      store.set("nav-state", JSON.stringify({ lastUrl: "/setup", apps: {} }));
      expect(getLastUrl()).toBeUndefined();
    });
  });

  describe("getLastAppId", () => {
    it("returns app ID from last app URL", () => {
      saveNavigation("/dashboard/apps/app-1/details", "");
      expect(getLastAppId()).toBe("app-1");
    });

    it("returns undefined when no app was ever visited", () => {
      saveNavigation("/dashboard", "");
      expect(getLastAppId()).toBeUndefined();
    });
  });

  describe("getAppState", () => {
    it("returns undefined for unknown appId", () => {
      expect(getAppState("nonexistent")).toBeUndefined();
    });
  });

  describe("clearNavigation", () => {
    it("removes persisted dashboard state", () => {
      saveNavigation("/dashboard/apps/app-1/details", "");
      clearNavigation();
      expect(getLastUrl()).toBeUndefined();
      expect(getLastAppId()).toBeUndefined();
      expect(getAppState("app-1")).toBeUndefined();
    });
  });

  describe("error resilience", () => {
    it("handles corrupted localStorage gracefully", () => {
      store.set("nav-state", "not json");
      expect(getLastUrl()).toBeUndefined();
      expect(getAppState("app-1")).toBeUndefined();
    });

    it("handles localStorage.setItem throwing", () => {
      const original = localStorage.setItem;
      vi.stubGlobal("localStorage", {
        ...localStorage,
        setItem: () => { throw new Error("quota exceeded"); },
        getItem: () => null,
      });

      // Should not throw
      expect(() => saveNavigation("/dashboard/apps/app-1/details", "")).not.toThrow();

      vi.stubGlobal("localStorage", { ...localStorage, setItem: original });
    });
  });
});
