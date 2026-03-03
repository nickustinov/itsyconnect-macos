import { describe, it, expect, vi } from "vitest";
import { errorJson, parseBody, syncLocalizations } from "@/lib/api-helpers";
import type { SyncLocalizationsMutations } from "@/lib/api-helpers";
import { AscApiError } from "@/lib/asc/client";
import { z } from "zod";

describe("api-helpers", () => {
  describe("errorJson", () => {
    it("extracts message from Error instances", async () => {
      const res = errorJson(new Error("something broke"));
      const body = await res.json();
      expect(res.status).toBe(502);
      expect(body.error).toBe("something broke");
    });

    it("uses fallback for non-Error values", async () => {
      const res = errorJson("string error");
      const body = await res.json();
      expect(body.error).toBe("Unknown error");
    });

    it("accepts custom status and fallback", async () => {
      const res = errorJson(42, 500, "Custom fallback");
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body.error).toBe("Custom fallback");
    });

    it("uses fallback status when AscApiError has no statusCode", async () => {
      const ascErr = new AscApiError({
        category: "connection",
        message: "Could not connect",
      });
      const res = errorJson(ascErr, 503);
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.error).toBe("Could not connect");
      expect(body.category).toBe("connection");
      expect(body.ascErrors).toBeUndefined();
      expect(body.ascMethod).toBeUndefined();
      expect(body.ascPath).toBeUndefined();
    });

    it("extracts structured fields from AscApiError", async () => {
      const ascErr = new AscApiError({
        category: "api",
        message: "Entity not found",
        statusCode: 404,
        method: "GET",
        path: "/v1/apps/123",
        entries: [{ code: "NOT_FOUND", title: "Not found", detail: "Entity not found" }],
      });
      const res = errorJson(ascErr);
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error).toBe("Entity not found");
      expect(body.category).toBe("api");
      expect(body.ascErrors).toHaveLength(1);
      expect(body.ascMethod).toBe("GET");
      expect(body.ascPath).toBe("/v1/apps/123");
    });
  });

  describe("parseBody", () => {
    const schema = z.object({ name: z.string(), age: z.number() });

    function makeRequest(body: unknown): Request {
      return new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    it("returns parsed data for valid input", async () => {
      const result = await parseBody(makeRequest({ name: "Alice", age: 30 }), schema);
      expect(result).toEqual({ name: "Alice", age: 30 });
    });

    it("returns 400 Response for invalid JSON", async () => {
      const req = new Request("http://localhost", {
        method: "POST",
        body: "not json",
      });
      const result = await parseBody(req, schema);
      expect(result).toBeInstanceOf(Response);
      const body = await (result as Response).json();
      expect(body.error).toBe("Invalid JSON body");
    });

    it("returns 400 Response for schema validation failure", async () => {
      const result = await parseBody(makeRequest({ name: 123 }), schema);
      expect(result).toBeInstanceOf(Response);
      const body = await (result as Response).json();
      expect(body.error).toBe("Validation failed");
      expect(body.details).toBeDefined();
    });
  });

  describe("syncLocalizations", () => {
    function makePutRequest(body: unknown): Request {
      return new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    function makeMutations(overrides?: Partial<SyncLocalizationsMutations>): SyncLocalizationsMutations {
      return {
        update: vi.fn<(id: string, fields: Record<string, unknown>) => Promise<void>>().mockResolvedValue(undefined),
        create: vi.fn<(parentId: string, locale: string, fields: Record<string, unknown>) => Promise<string>>().mockResolvedValue("new-id"),
        delete: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
        invalidateCache: vi.fn(),
        ...overrides,
      };
    }

    it("updates existing localizations", async () => {
      const mutations = makeMutations();
      const req = makePutRequest({
        locales: { "en-US": { title: "Hello" } },
        originalLocaleIds: { "en-US": "loc-1" },
      });
      const res = await syncLocalizations(req, "parent-1", mutations);
      const body = await res.json();

      expect(mutations.update).toHaveBeenCalledWith("loc-1", { title: "Hello" });
      expect(mutations.create).not.toHaveBeenCalled();
      expect(mutations.delete).not.toHaveBeenCalled();
      expect(mutations.invalidateCache).toHaveBeenCalled();
      expect(body.ok).toBe(true);
      expect(body.createdIds).toEqual({});
    });

    it("creates new localizations", async () => {
      const mutations = makeMutations({
        create: vi.fn<(parentId: string, locale: string, fields: Record<string, unknown>) => Promise<string>>().mockResolvedValue("created-42"),
      });
      const req = makePutRequest({
        locales: { "fr-FR": { title: "Bonjour" } },
        originalLocaleIds: {},
      });
      const res = await syncLocalizations(req, "parent-1", mutations);
      const body = await res.json();

      expect(mutations.create).toHaveBeenCalledWith("parent-1", "fr-FR", { title: "Bonjour" });
      expect(body.ok).toBe(true);
      expect(body.createdIds).toEqual({ "fr-FR": "created-42" });
    });

    it("deletes removed localizations", async () => {
      const mutations = makeMutations();
      const req = makePutRequest({
        locales: {},
        originalLocaleIds: { "de-DE": "loc-99" },
      });
      const res = await syncLocalizations(req, "parent-1", mutations);
      const body = await res.json();

      expect(mutations.delete).toHaveBeenCalledWith("loc-99");
      expect(body.ok).toBe(true);
    });

    it("handles mixed create, update, and delete", async () => {
      const mutations = makeMutations({
        create: vi.fn<(parentId: string, locale: string, fields: Record<string, unknown>) => Promise<string>>().mockResolvedValue("new-id"),
      });
      const req = makePutRequest({
        locales: {
          "en-US": { title: "Updated" },
          "ja-JP": { title: "New" },
        },
        originalLocaleIds: { "en-US": "loc-1", "de-DE": "loc-2" },
      });
      const res = await syncLocalizations(req, "p1", mutations);
      const body = await res.json();

      expect(mutations.update).toHaveBeenCalledWith("loc-1", { title: "Updated" });
      expect(mutations.create).toHaveBeenCalledWith("p1", "ja-JP", { title: "New" });
      expect(mutations.delete).toHaveBeenCalledWith("loc-2");
      expect(body.ok).toBe(true);
      expect(body.createdIds).toEqual({ "ja-JP": "new-id" });
    });

    it("returns 207 with errors on partial failure", async () => {
      const mutations = makeMutations({
        update: vi.fn<(id: string, fields: Record<string, unknown>) => Promise<void>>().mockRejectedValue(new Error("API down")),
      });
      const req = makePutRequest({
        locales: { "en-US": { title: "Fail" } },
        originalLocaleIds: { "en-US": "loc-1" },
      });
      const res = await syncLocalizations(req, "p1", mutations);
      const body = await res.json();

      expect(res.status).toBe(207);
      expect(body.ok).toBe(false);
      expect(body.errors).toEqual([
        { operation: "update", locale: "en-US", message: "API down" },
      ]);
      expect(mutations.invalidateCache).toHaveBeenCalled();
    });

    it("uses 'failed' fallback for non-Error rejections", async () => {
      const mutations = makeMutations({
        delete: vi.fn<(id: string) => Promise<void>>().mockRejectedValue("string-error"),
      });
      const req = makePutRequest({
        locales: {},
        originalLocaleIds: { "en-US": "loc-1" },
      });
      const res = await syncLocalizations(req, "p1", mutations);
      const body = await res.json();

      expect(res.status).toBe(207);
      expect(body.errors).toEqual([
        { operation: "delete", locale: "en-US", message: "failed" },
      ]);
    });

    it("uses 'failed' fallback for non-Error create rejections", async () => {
      const mutations = makeMutations({
        create: vi.fn<(parentId: string, locale: string, fields: Record<string, unknown>) => Promise<string>>().mockRejectedValue(42),
      });
      const req = makePutRequest({
        locales: { "fr-FR": { title: "New" } },
        originalLocaleIds: {},
      });
      const res = await syncLocalizations(req, "p1", mutations);
      const body = await res.json();

      expect(res.status).toBe(207);
      expect(body.errors).toEqual([
        { operation: "create", locale: "fr-FR", message: "failed" },
      ]);
    });

    it("uses 'failed' fallback for non-Error update rejections", async () => {
      const mutations = makeMutations({
        update: vi.fn<(id: string, fields: Record<string, unknown>) => Promise<void>>().mockRejectedValue(null),
      });
      const req = makePutRequest({
        locales: { "en-US": { title: "Fail" } },
        originalLocaleIds: { "en-US": "loc-1" },
      });
      const res = await syncLocalizations(req, "p1", mutations);
      const body = await res.json();

      expect(res.status).toBe(207);
      expect(body.errors).toEqual([
        { operation: "update", locale: "en-US", message: "failed" },
      ]);
    });

    it("extracts ASC error details on update failure with AscApiError", async () => {
      const ascErr = new AscApiError({
        category: "api",
        message: "validation failed",
        statusCode: 422,
        method: "PATCH",
        path: "/v1/localizations/loc-1",
        entries: [{ code: "INVALID", title: "Invalid", detail: "Too long" }],
      });
      const mutations = makeMutations({
        update: vi.fn<(id: string, fields: Record<string, unknown>) => Promise<void>>().mockRejectedValue(ascErr),
      });
      const req = makePutRequest({
        locales: { "en-US": { title: "Bad" } },
        originalLocaleIds: { "en-US": "loc-1" },
      });
      const res = await syncLocalizations(req, "p1", mutations);
      const body = await res.json();

      expect(res.status).toBe(207);
      expect(body.errors[0]).toEqual({
        operation: "update",
        locale: "en-US",
        message: "validation failed",
        ascErrors: [{ code: "INVALID", title: "Invalid", detail: "Too long" }],
        ascMethod: "PATCH",
        ascPath: "/v1/localizations/loc-1",
      });
    });

    it("extracts ASC error details on create failure with AscApiError", async () => {
      const ascErr = new AscApiError({
        category: "api",
        message: "conflict",
        statusCode: 409,
        method: "POST",
        path: "/v1/localizations",
        entries: [{ code: "CONFLICT", title: "Conflict", detail: "Already exists" }],
      });
      const mutations = makeMutations({
        create: vi.fn<(parentId: string, locale: string, fields: Record<string, unknown>) => Promise<string>>().mockRejectedValue(ascErr),
      });
      const req = makePutRequest({
        locales: { "fr-FR": { title: "New" } },
        originalLocaleIds: {},
      });
      const res = await syncLocalizations(req, "p1", mutations);
      const body = await res.json();

      expect(res.status).toBe(207);
      expect(body.errors[0]).toEqual({
        operation: "create",
        locale: "fr-FR",
        message: "conflict",
        ascErrors: [{ code: "CONFLICT", title: "Conflict", detail: "Already exists" }],
        ascMethod: "POST",
        ascPath: "/v1/localizations",
      });
    });

    it("extracts ASC error details on delete failure with AscApiError", async () => {
      const ascErr = new AscApiError({
        category: "api",
        message: "not found",
        statusCode: 404,
        method: "DELETE",
        path: "/v1/localizations/loc-1",
        entries: [{ code: "NOT_FOUND", title: "Not found", detail: "Resource missing" }],
      });
      const mutations = makeMutations({
        delete: vi.fn<(id: string) => Promise<void>>().mockRejectedValue(ascErr),
      });
      const req = makePutRequest({
        locales: {},
        originalLocaleIds: { "de-DE": "loc-1" },
      });
      const res = await syncLocalizations(req, "p1", mutations);
      const body = await res.json();

      expect(res.status).toBe(207);
      expect(body.errors[0]).toEqual({
        operation: "delete",
        locale: "de-DE",
        message: "not found",
        ascErrors: [{ code: "NOT_FOUND", title: "Not found", detail: "Resource missing" }],
        ascMethod: "DELETE",
        ascPath: "/v1/localizations/loc-1",
      });
    });

    it("extracts message from Error on create failure", async () => {
      const mutations = makeMutations({
        create: vi.fn<(parentId: string, locale: string, fields: Record<string, unknown>) => Promise<string>>().mockRejectedValue(new Error("quota exceeded")),
      });
      const req = makePutRequest({
        locales: { "fr-FR": { title: "New" } },
        originalLocaleIds: {},
      });
      const res = await syncLocalizations(req, "p1", mutations);
      const body = await res.json();

      expect(res.status).toBe(207);
      expect(body.errors).toEqual([
        { operation: "create", locale: "fr-FR", message: "quota exceeded" },
      ]);
    });

    it("extracts message from Error on delete failure", async () => {
      const mutations = makeMutations({
        delete: vi.fn<(id: string) => Promise<void>>().mockRejectedValue(new Error("forbidden")),
      });
      const req = makePutRequest({
        locales: {},
        originalLocaleIds: { "de-DE": "loc-5" },
      });
      const res = await syncLocalizations(req, "p1", mutations);
      const body = await res.json();

      expect(res.status).toBe(207);
      expect(body.errors).toEqual([
        { operation: "delete", locale: "de-DE", message: "forbidden" },
      ]);
    });
  });
});
