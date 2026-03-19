import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAscFetch = vi.fn();
const mockCacheInvalidate = vi.fn();

vi.mock("@/lib/asc/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/asc/client")>();
  return {
    ...actual,
    ascFetch: (...args: unknown[]) => mockAscFetch(...args),
  };
});

vi.mock("@/lib/cache", () => ({
  cacheInvalidate: (...args: unknown[]) => mockCacheInvalidate(...args),
}));

const mockListLocalizations = vi.fn();
vi.mock("@/lib/asc/localizations", () => ({
  listLocalizations: (...args: unknown[]) => mockListLocalizations(...args),
}));

const mockListAppInfoLocalizations = vi.fn();
vi.mock("@/lib/asc/app-info", () => ({
  listAppInfoLocalizations: (...args: unknown[]) => mockListAppInfoLocalizations(...args),
}));

import { AscApiError } from "@/lib/asc/client";
import type { AscError } from "@/lib/asc/errors";
import {
  updateVersionLocalization,
  createVersionLocalization,
  deleteVersionLocalization,
  invalidateLocalizationsCache,
  updateAppInfoLocalization,
  createAppInfoLocalization,
  deleteAppInfoLocalization,
  invalidateAppInfoLocalizationsCache,
} from "@/lib/asc/localization-mutations";

function make409(): AscApiError {
  const ascError: AscError = { category: "api", message: "Conflict", statusCode: 409 };
  return new AscApiError(ascError);
}

function make404(): AscApiError {
  const ascError: AscError = { category: "api", message: "Not found", statusCode: 404 };
  return new AscApiError(ascError);
}

function make500(): AscApiError {
  const ascError: AscError = { category: "connection", message: "Server error", statusCode: 500 };
  return new AscApiError(ascError);
}

describe("localization-mutations", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheInvalidate.mockReset();
    mockListLocalizations.mockReset();
    mockListAppInfoLocalizations.mockReset();
  });

  describe("updateVersionLocalization", () => {
    it("PATCHes the localization with cleaned attributes", async () => {
      mockAscFetch.mockResolvedValue({});

      await updateVersionLocalization("loc-1", {
        whatsNew: "Bug fixes",
        supportUrl: "",
        marketingUrl: "https://example.com",
      });

      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/appStoreVersionLocalizations/loc-1",
        expect.objectContaining({ method: "PATCH" }),
      );

      const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
      expect(body.data.attributes.supportUrl).toBeNull();
      expect(body.data.attributes.marketingUrl).toBe("https://example.com");
      expect(body.data.attributes.whatsNew).toBe("Bug fixes");
    });

    it("passes non-string values through unchanged", async () => {
      mockAscFetch.mockResolvedValue({});

      await updateVersionLocalization("loc-1", {
        whatsNew: "Notes",
        someFlag: true,
      } as Record<string, unknown>);

      const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
      expect(body.data.attributes.someFlag).toBe(true);
    });
  });

  describe("createVersionLocalization", () => {
    it("POSTs a new localization and returns its ID", async () => {
      mockAscFetch.mockResolvedValue({ data: { id: "new-loc-1" } });

      const id = await createVersionLocalization("ver-1", "de-DE", {
        whatsNew: "Fehlerbehebungen",
        description: "",
      });

      expect(id).toBe("new-loc-1");
      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/appStoreVersionLocalizations",
        expect.objectContaining({ method: "POST" }),
      );

      const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
      expect(body.data.attributes.locale).toBe("de-DE");
      expect(body.data.attributes.whatsNew).toBe("Fehlerbehebungen");
      // Empty strings are stripped on create
      expect(body.data.attributes.description).toBeUndefined();
      expect(body.data.relationships.appStoreVersion.data.id).toBe("ver-1");
    });

    it("falls back to update on 409 when existing locale is found", async () => {
      mockAscFetch
        .mockRejectedValueOnce(make409())
        .mockResolvedValueOnce({}); // the PATCH from updateVersionLocalization
      mockListLocalizations.mockResolvedValue([
        { id: "existing-loc-1", attributes: { locale: "de-DE" } },
      ]);

      const id = await createVersionLocalization("ver-1", "de-DE", { whatsNew: "Fix" });

      expect(id).toBe("existing-loc-1");
      expect(mockListLocalizations).toHaveBeenCalledWith("ver-1", true);
      // Second call is the PATCH update
      expect(mockAscFetch).toHaveBeenCalledTimes(2);
    });

    it("re-throws 409 when no existing locale matches", async () => {
      mockAscFetch.mockRejectedValueOnce(make409());
      mockListLocalizations.mockResolvedValue([
        { id: "existing-loc-1", attributes: { locale: "fr-FR" } },
      ]);

      await expect(createVersionLocalization("ver-1", "de-DE", { whatsNew: "Fix" }))
        .rejects.toThrow("Conflict");
    });

    it("re-throws non-409 errors", async () => {
      mockAscFetch.mockRejectedValueOnce(make500());

      await expect(createVersionLocalization("ver-1", "de-DE", { whatsNew: "Fix" }))
        .rejects.toThrow("Server error");
    });

    it("re-throws non-AscApiError errors without checking statusCode", async () => {
      mockAscFetch.mockRejectedValueOnce(new Error("Network failure"));

      await expect(createVersionLocalization("ver-1", "de-DE", { whatsNew: "Fix" }))
        .rejects.toThrow("Network failure");
    });
  });

  describe("deleteVersionLocalization", () => {
    it("DELETEs the localization", async () => {
      mockAscFetch.mockResolvedValue(null);

      await deleteVersionLocalization("loc-1");

      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/appStoreVersionLocalizations/loc-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("swallows 404 errors", async () => {
      mockAscFetch.mockRejectedValueOnce(make404());

      await expect(deleteVersionLocalization("loc-1")).resolves.toBeUndefined();
    });

    it("throws non-404 errors", async () => {
      mockAscFetch.mockRejectedValueOnce(make500());

      await expect(deleteVersionLocalization("loc-1")).rejects.toThrow("Server error");
    });
  });

  describe("invalidateLocalizationsCache", () => {
    it("invalidates the cache for the given version", () => {
      invalidateLocalizationsCache("ver-1");
      expect(mockCacheInvalidate).toHaveBeenCalledWith("localizations:ver-1");
    });
  });

  describe("updateAppInfoLocalization", () => {
    it("PATCHes the app info localization with cleaned attributes", async () => {
      mockAscFetch.mockResolvedValue({});

      await updateAppInfoLocalization("info-loc-1", {
        name: "My App",
        privacyPolicyUrl: "",
        privacyChoicesUrl: "",
      });

      const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
      expect(body.data.attributes.name).toBe("My App");
      expect(body.data.attributes.privacyPolicyUrl).toBeNull();
      expect(body.data.attributes.privacyChoicesUrl).toBeNull();
    });
  });

  describe("createAppInfoLocalization", () => {
    it("POSTs a new app info localization and returns its ID", async () => {
      mockAscFetch.mockResolvedValue({ data: { id: "new-info-loc-1" } });

      const id = await createAppInfoLocalization("info-1", "fr-FR", {
        name: "Mon App",
        subtitle: "",
      });

      expect(id).toBe("new-info-loc-1");
      const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
      expect(body.data.attributes.locale).toBe("fr-FR");
      expect(body.data.attributes.name).toBe("Mon App");
      expect(body.data.attributes.subtitle).toBeUndefined();
      expect(body.data.relationships.appInfo.data.id).toBe("info-1");
    });

    it("falls back to update on 409 when existing locale is found", async () => {
      mockAscFetch
        .mockRejectedValueOnce(make409())
        .mockResolvedValueOnce({}); // the PATCH from updateAppInfoLocalization
      mockListAppInfoLocalizations.mockResolvedValue([
        { id: "existing-info-loc-1", attributes: { locale: "fr-FR" } },
      ]);

      const id = await createAppInfoLocalization("info-1", "fr-FR", { name: "Mon App" });

      expect(id).toBe("existing-info-loc-1");
      expect(mockListAppInfoLocalizations).toHaveBeenCalledWith("info-1", true);
      expect(mockAscFetch).toHaveBeenCalledTimes(2);
    });

    it("re-throws 409 when no existing locale matches", async () => {
      mockAscFetch.mockRejectedValueOnce(make409());
      mockListAppInfoLocalizations.mockResolvedValue([
        { id: "existing-info-loc-1", attributes: { locale: "de-DE" } },
      ]);

      await expect(createAppInfoLocalization("info-1", "fr-FR", { name: "Mon App" }))
        .rejects.toThrow("Conflict");
    });

    it("re-throws non-AscApiError errors without checking statusCode", async () => {
      mockAscFetch.mockRejectedValueOnce(new Error("Network failure"));

      await expect(createAppInfoLocalization("info-1", "fr-FR", { name: "Mon App" }))
        .rejects.toThrow("Network failure");
    });
  });

  describe("deleteAppInfoLocalization", () => {
    it("DELETEs the app info localization", async () => {
      mockAscFetch.mockResolvedValue(null);

      await deleteAppInfoLocalization("info-loc-1");

      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/appInfoLocalizations/info-loc-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("swallows 404 errors", async () => {
      mockAscFetch.mockRejectedValueOnce(make404());

      await expect(deleteAppInfoLocalization("info-loc-1")).resolves.toBeUndefined();
    });

    it("throws non-404 errors", async () => {
      mockAscFetch.mockRejectedValueOnce(make500());

      await expect(deleteAppInfoLocalization("info-loc-1")).rejects.toThrow("Server error");
    });
  });

  describe("invalidateAppInfoLocalizationsCache", () => {
    it("invalidates the cache for the given app info", () => {
      invalidateAppInfoLocalizationsCache("info-1");
      expect(mockCacheInvalidate).toHaveBeenCalledWith("appInfoLocalizations:info-1");
    });
  });
});
