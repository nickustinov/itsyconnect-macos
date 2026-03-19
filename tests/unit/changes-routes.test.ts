import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { createTestDb } from "../helpers/test-db";

let testDb: ReturnType<typeof createTestDb>;

const mockPublishSection = vi.fn();

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/ulid", () => ({
  ulid: () => "test-ulid-001",
}));

vi.mock("@/lib/publish-changes", () => ({
  publishSection: (...args: unknown[]) => mockPublishSection(...args),
}));

describe("changes API routes", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockPublishSection.mockReset();
    vi.resetModules();
  });

  function insertChange(
    id: string,
    appId: string,
    section: string,
    scope: string,
    data: Record<string, unknown>,
  ) {
    testDb.insert(schema.pendingChanges).values({
      id,
      appId,
      section,
      scope,
      field: "all",
      value: JSON.stringify(data),
      originalValue: JSON.stringify({}),
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    }).run();
  }

  describe("GET /api/changes/[appId]", () => {
    it("returns changes and total count for an app", async () => {
      const { GET } = await import("@/app/api/changes/[appId]/route");

      insertChange("c-1", "app-1", "store-listing", "v1", { title: "Hi" });
      insertChange("c-2", "app-1", "keywords", "v1", { kw: "test" });
      insertChange("c-3", "app-2", "details", "i1", { name: "Other" });

      const response = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ appId: "app-1" }),
      });
      const data = await response.json();

      expect(data.changes).toHaveLength(2);
      expect(data.totalCount).toBe(3);
    });

    it("returns empty changes for an app with none", async () => {
      const { GET } = await import("@/app/api/changes/[appId]/route");

      const response = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ appId: "app-1" }),
      });
      const data = await response.json();

      expect(data.changes).toEqual([]);
      expect(data.totalCount).toBe(0);
    });
  });

  describe("DELETE /api/changes/[appId]", () => {
    it("deletes all changes for an app", async () => {
      const route = await import("@/app/api/changes/[appId]/route");

      insertChange("c-1", "app-1", "store-listing", "v1", { a: 1 });
      insertChange("c-2", "app-1", "keywords", "v1", { b: 2 });
      insertChange("c-3", "app-2", "details", "i1", { c: 3 });

      const response = await route.DELETE(new Request("http://localhost"), {
        params: Promise.resolve({ appId: "app-1" }),
      });
      const data = await response.json();

      expect(data.ok).toBe(true);

      // Verify app-2's changes are still there
      const remaining = testDb.select().from(schema.pendingChanges).all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].appId).toBe("app-2");
    });
  });

  describe("GET /api/changes/[appId]/[section]", () => {
    it("returns a section change with scope from query param", async () => {
      const { GET } = await import("@/app/api/changes/[appId]/[section]/route");

      insertChange("c-1", "app-1", "store-listing", "v1", { title: "Hi" });

      const response = await GET(
        new Request("http://localhost/api/changes/app-1/store-listing?scope=v1"),
        { params: Promise.resolve({ appId: "app-1", section: "store-listing" }) },
      );
      const data = await response.json();

      expect(data.change).not.toBeNull();
      expect(data.change.data).toEqual({ title: "Hi" });
    });

    it("returns null when no change exists", async () => {
      const { GET } = await import("@/app/api/changes/[appId]/[section]/route");

      const response = await GET(
        new Request("http://localhost/api/changes/app-1/store-listing?scope=v1"),
        { params: Promise.resolve({ appId: "app-1", section: "store-listing" }) },
      );
      const data = await response.json();

      expect(data.change).toBeNull();
    });

    it("defaults scope to empty string when not provided", async () => {
      const { GET } = await import("@/app/api/changes/[appId]/[section]/route");

      insertChange("c-1", "app-1", "store-listing", "", { title: "No scope" });

      const response = await GET(
        new Request("http://localhost/api/changes/app-1/store-listing"),
        { params: Promise.resolve({ appId: "app-1", section: "store-listing" }) },
      );
      const data = await response.json();

      expect(data.change).not.toBeNull();
    });
  });

  describe("PUT /api/changes/[appId]/[section]", () => {
    it("creates a new section change", async () => {
      const { PUT } = await import("@/app/api/changes/[appId]/[section]/route");

      const response = await PUT(
        new Request("http://localhost", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: "v1",
            data: { title: "New" },
            originalData: { title: "Old" },
          }),
        }),
        { params: Promise.resolve({ appId: "app-1", section: "store-listing" }) },
      );
      const data = await response.json();

      expect(data.ok).toBe(true);

      const rows = testDb.select().from(schema.pendingChanges).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].section).toBe("store-listing");
    });
  });

  describe("DELETE /api/changes/[appId]/[section]", () => {
    it("deletes a specific section change", async () => {
      const route = await import("@/app/api/changes/[appId]/[section]/route");

      insertChange("c-1", "app-1", "store-listing", "v1", { a: 1 });
      insertChange("c-2", "app-1", "keywords", "v1", { b: 2 });

      const response = await route.DELETE(
        new Request("http://localhost/api/changes/app-1/store-listing?scope=v1"),
        { params: Promise.resolve({ appId: "app-1", section: "store-listing" }) },
      );
      const data = await response.json();

      expect(data.ok).toBe(true);

      const remaining = testDb.select().from(schema.pendingChanges).all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].section).toBe("keywords");
    });
  });

  describe("POST /api/changes/publish", () => {
    it("returns 400 when appId is missing", async () => {
      const { POST } = await import("@/app/api/changes/publish/route");

      const response = await POST(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("appId is required");
    });

    it("returns empty results when no changes exist", async () => {
      const { POST } = await import("@/app/api/changes/publish/route");

      const response = await POST(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appId: "app-1" }),
        }),
      );

      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.results).toEqual([]);
    });

    it("publishes all sections and clears successful ones", async () => {
      const { POST } = await import("@/app/api/changes/publish/route");

      insertChange("c-1", "app-1", "store-listing", "v1", { a: 1 });
      insertChange("c-2", "app-1", "keywords", "v1", { b: 2 });

      mockPublishSection.mockResolvedValue({
        section: "store-listing",
        scope: "v1",
        ok: true,
        errors: [],
      });

      // Mock is called for each change; return ok for both
      mockPublishSection.mockResolvedValueOnce({
        section: "store-listing", scope: "v1", ok: true, errors: [],
      }).mockResolvedValueOnce({
        section: "keywords", scope: "v1", ok: true, errors: [],
      });

      const response = await POST(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appId: "app-1" }),
        }),
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.results).toHaveLength(2);

      // Buffer should be cleared for successful sections
      const remaining = testDb.select().from(schema.pendingChanges).all();
      expect(remaining).toEqual([]);
    });

    it("returns 207 when some sections fail and keeps failed in buffer", async () => {
      const { POST } = await import("@/app/api/changes/publish/route");

      insertChange("c-1", "app-1", "store-listing", "v1", { a: 1 });
      insertChange("c-2", "app-1", "keywords", "v1", { b: 2 });

      mockPublishSection.mockResolvedValueOnce({
        section: "store-listing", scope: "v1", ok: true, errors: [],
      }).mockResolvedValueOnce({
        section: "keywords", scope: "v1", ok: false,
        errors: [{ operation: "update", locale: "", message: "Failed" }],
      });

      const response = await POST(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appId: "app-1" }),
        }),
      );

      expect(response.status).toBe(207);
      const data = await response.json();
      expect(data.ok).toBe(false);

      // Only successful section should be cleared
      const remaining = testDb.select().from(schema.pendingChanges).all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].section).toBe("keywords");
    });
  });
});
