import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSyncLocalizationsFromData = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  syncLocalizationsFromData: (...args: unknown[]) => {
    // Call the invalidateCache callback so coverage reaches those arrow functions
    const ops = args[3] as { invalidateCache?: () => void } | undefined;
    ops?.invalidateCache?.();
    return mockSyncLocalizationsFromData(...args);
  },
}));

vi.mock("@/lib/asc/localization-mutations", () => ({
  updateVersionLocalization: vi.fn(),
  createVersionLocalization: vi.fn(),
  deleteVersionLocalization: vi.fn(),
  invalidateLocalizationsCache: vi.fn(),
  updateAppInfoLocalization: vi.fn(),
  createAppInfoLocalization: vi.fn(),
  deleteAppInfoLocalization: vi.fn(),
  invalidateAppInfoLocalizationsCache: vi.fn(),
}));

import { publishSection } from "@/lib/publish-changes";
import type { SectionChange } from "@/lib/change-buffer";

describe("publish-changes", () => {
  let originalBaseUrl: string | undefined;

  beforeEach(() => {
    originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    process.env.NEXT_PUBLIC_BASE_URL = "http://test:3000";
    mockSyncLocalizationsFromData.mockReset();
    mockSyncLocalizationsFromData.mockResolvedValue({ errors: [] });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
  });

  afterEach(() => {
    if (originalBaseUrl !== undefined) {
      process.env.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
    } else {
      delete process.env.NEXT_PUBLIC_BASE_URL;
    }
    vi.restoreAllMocks();
  });

  function makeChange(overrides: Partial<SectionChange> = {}): SectionChange {
    return {
      id: "c-1",
      appId: "app-1",
      section: "store-listing",
      scope: "version-1",
      data: {},
      originalData: {},
      updatedAt: "2026-01-01T00:00:00Z",
      ...overrides,
    };
  }

  describe("store-listing", () => {
    it("syncs locales via syncLocalizationsFromData", async () => {
      const result = await publishSection(makeChange({
        data: {
          locales: { "en-US": { description: "Test" } },
        },
        originalData: {
          localeIds: { "en-US": "loc-1" },
        },
      }));

      expect(result.ok).toBe(true);
      expect(mockSyncLocalizationsFromData).toHaveBeenCalledWith(
        { "en-US": { description: "Test" } },
        { "en-US": "loc-1" },
        "version-1",
        expect.any(Object),
      );
    });

    it("filters locale IDs to only changed locales", async () => {
      await publishSection(makeChange({
        data: {
          locales: { "en-US": { description: "Test" } },
        },
        originalData: {
          localeIds: { "en-US": "loc-1", "fr-FR": "loc-2" },
        },
      }));

      const call = mockSyncLocalizationsFromData.mock.calls[0];
      expect(call[1]).toEqual({ "en-US": "loc-1" });
    });

    it("publishes release settings", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await publishSection(makeChange({
        data: { releaseType: "manually" },
        originalData: { phasedReleaseId: "pr-1" },
      }));

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://test:3000/api/apps/app-1/versions/version-1/release",
        expect.objectContaining({ method: "PUT" }),
      );
    });

    it("maps 'after-date' release type with scheduled date", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await publishSection(makeChange({
        data: {
          releaseType: "after-date",
          scheduledDate: "2026-06-01T00:00:00Z",
        },
        originalData: {},
      }));

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.releaseType).toBe("SCHEDULED");
      expect(body.earliestReleaseDate).toBe("2026-06-01T00:00:00Z");
    });

    it("maps default release type to AFTER_APPROVAL", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await publishSection(makeChange({
        data: { releaseType: "automatically" },
        originalData: {},
      }));

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.releaseType).toBe("AFTER_APPROVAL");
    });

    it("publishes phased release setting", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await publishSection(makeChange({
        data: { phasedRelease: true },
        originalData: {},
      }));

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.phasedRelease).toBe(true);
    });

    it("publishes build and copyright", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await publishSection(makeChange({
        data: { buildId: "build-1", copyright: "2026 Test" },
      }));

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://test:3000/api/apps/app-1/versions/version-1",
        expect.objectContaining({ method: "PATCH" }),
      );
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.buildId).toBe("build-1");
      expect(body.copyright).toBe("2026 Test");
    });

    it("collects errors from failed release settings", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "Release failed" }), { status: 500 }),
      );

      const result = await publishSection(makeChange({
        data: { releaseType: "manually" },
        originalData: {},
      }));

      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe("Release failed");
    });

    it("collects errors from failed version attributes", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({}), { status: 500 }),
      );

      const result = await publishSection(makeChange({
        data: { copyright: "2026" },
      }));

      expect(result.ok).toBe(false);
      expect(result.errors[0].message).toBe("Version attributes failed");
    });

    it("handles non-JSON error responses from release settings", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Internal Server Error", { status: 500, headers: { "Content-Type": "text/plain" } }),
      );

      const result = await publishSection(makeChange({
        data: { releaseType: "manually" },
        originalData: {},
      }));

      expect(result.ok).toBe(false);
      expect(result.errors[0].message).toBe("Release settings failed");
    });

    it("handles non-JSON error responses from version attributes", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("error", { status: 500 }),
      );

      const result = await publishSection(makeChange({
        data: { buildId: "b-1" },
      }));

      expect(result.ok).toBe(false);
      expect(result.errors[0].message).toBe("Version attributes failed");
    });

    it("skips empty locales", async () => {
      await publishSection(makeChange({
        data: { locales: {} },
        originalData: { localeIds: {} },
      }));

      expect(mockSyncLocalizationsFromData).not.toHaveBeenCalled();
    });
  });

  describe("details", () => {
    it("syncs app info locales", async () => {
      await publishSection(makeChange({
        section: "details",
        scope: "info-1",
        data: {
          locales: { "en-US": { name: "App" } },
        },
        originalData: {
          localeIds: { "en-US": "loc-1" },
        },
      }));

      expect(mockSyncLocalizationsFromData).toHaveBeenCalledWith(
        { "en-US": { name: "App" } },
        { "en-US": "loc-1" },
        "info-1",
        expect.any(Object),
      );
    });

    it("publishes app attributes", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await publishSection(makeChange({
        section: "details",
        data: {
          contentRights: "USES_THIRD_PARTY_CONTENT",
          notifUrl: "https://example.com/hook",
          notifSandboxUrl: "",
        },
      }));

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://test:3000/api/apps/app-1/attributes",
        expect.objectContaining({ method: "PATCH" }),
      );
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.contentRightsDeclaration).toBe("USES_THIRD_PARTY_CONTENT");
      expect(body.subscriptionStatusUrl).toBe("https://example.com/hook");
      expect(body.subscriptionStatusUrlForSandbox).toBeNull();
    });

    it("publishes categories", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await publishSection(makeChange({
        section: "details",
        scope: "info-1",
        data: {
          primaryCategoryId: "cat-1",
          secondaryCategoryId: "",
        },
      }));

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://test:3000/api/apps/app-1/info/info-1/categories",
        expect.objectContaining({ method: "PATCH" }),
      );
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.primaryCategoryId).toBe("cat-1");
      expect(body.secondaryCategoryId).toBeNull();
    });

    it("collects errors from failed app attributes", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "Attr failed" }), { status: 500 }),
      );

      const result = await publishSection(makeChange({
        section: "details",
        data: { contentRights: "X" },
      }));

      expect(result.ok).toBe(false);
      expect(result.errors[0].message).toBe("Attr failed");
    });

    it("handles non-JSON error responses from app attributes", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("error", { status: 500 }),
      );

      const result = await publishSection(makeChange({
        section: "details",
        data: { contentRights: "X" },
      }));

      expect(result.ok).toBe(false);
      expect(result.errors[0].message).toBe("App attributes failed");
    });

    it("handles non-JSON error responses from categories", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("error", { status: 500 }),
      );

      const result = await publishSection(makeChange({
        section: "details",
        scope: "info-1",
        data: { primaryCategoryId: "cat-1" },
      }));

      expect(result.ok).toBe(false);
      expect(result.errors[0].message).toBe("Categories failed");
    });

    it("collects errors from failed categories", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({}), { status: 500 }),
      );

      const result = await publishSection(makeChange({
        section: "details",
        scope: "info-1",
        data: { primaryCategoryId: "cat-1" },
      }));

      expect(result.ok).toBe(false);
      expect(result.errors[0].message).toBe("Categories failed");
    });
  });

  describe("keywords", () => {
    it("syncs keyword locales", async () => {
      await publishSection(makeChange({
        section: "keywords",
        data: {
          locales: { "en-US": { keywords: "test,app" } },
        },
        originalData: {
          localeIds: { "en-US": "loc-1" },
        },
      }));

      expect(mockSyncLocalizationsFromData).toHaveBeenCalled();
    });

    it("skips when no locales provided", async () => {
      await publishSection(makeChange({ section: "keywords" }));
      expect(mockSyncLocalizationsFromData).not.toHaveBeenCalled();
    });
  });

  describe("review", () => {
    it("publishes review info", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await publishSection(makeChange({
        section: "review",
        data: {
          _reviewDetailId: "rd-1",
          contactFirstName: "John",
          contactLastName: "Doe",
        },
      }));

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://test:3000/api/apps/app-1/versions/version-1/review",
        expect.objectContaining({ method: "PUT" }),
      );
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.reviewDetailId).toBe("rd-1");
      expect(body.attributes.contactFirstName).toBe("John");
      expect(body.attributes._reviewDetailId).toBeUndefined();
    });

    it("excludes internal keys from review attributes", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await publishSection(makeChange({
        section: "review",
        data: {
          _reviewDetailId: "rd-1",
          locales: {},
          localeIds: {},
          phasedReleaseId: "pr-1",
          notes: "Test notes",
        },
      }));

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.attributes).toEqual({ notes: "Test notes" });
    });

    it("collects errors from failed review update", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "Review failed" }), { status: 500 }),
      );

      const result = await publishSection(makeChange({
        section: "review",
        data: { notes: "x" },
      }));

      expect(result.ok).toBe(false);
      expect(result.errors[0].message).toBe("Review failed");
    });

    it("handles non-JSON error responses from review", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("error", { status: 500 }),
      );

      const result = await publishSection(makeChange({
        section: "review",
        data: { notes: "x" },
      }));

      expect(result.ok).toBe(false);
      expect(result.errors[0].message).toBe("Review info failed");
    });
  });

  describe("unknown section", () => {
    it("returns error for unknown section type", async () => {
      const result = await publishSection(makeChange({
        section: "unknown-thing",
      }));

      expect(result.ok).toBe(false);
      expect(result.errors[0].message).toBe("Unknown section: unknown-thing");
    });
  });

  describe("exception handling", () => {
    it("catches thrown errors", async () => {
      mockSyncLocalizationsFromData.mockRejectedValue(new Error("Network down"));

      const result = await publishSection(makeChange({
        data: {
          locales: { "en-US": { description: "x" } },
        },
        originalData: {
          localeIds: { "en-US": "loc-1" },
        },
      }));

      expect(result.ok).toBe(false);
      expect(result.errors[0].message).toBe("Network down");
    });

    it("catches non-Error throws", async () => {
      mockSyncLocalizationsFromData.mockRejectedValue("string error");

      const result = await publishSection(makeChange({
        data: {
          locales: { "en-US": { description: "x" } },
        },
        originalData: {
          localeIds: { "en-US": "loc-1" },
        },
      }));

      expect(result.ok).toBe(false);
      expect(result.errors[0].message).toBe("Publish failed");
    });
  });

  describe("baseUrl fallback", () => {
    it("uses localhost when NEXT_PUBLIC_BASE_URL is not set", async () => {
      delete process.env.NEXT_PUBLIC_BASE_URL;
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await publishSection(makeChange({
        data: { copyright: "2026" },
      }));

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:3000/api/apps/app-1/versions/version-1",
        expect.any(Object),
      );
    });
  });
});
