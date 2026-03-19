import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { createTestDb } from "../helpers/test-db";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/ulid", () => ({
  ulid: () => "test-ulid-001",
}));

import {
  getChangesForApp,
  getSectionChange,
  upsertSectionChange,
  deleteSectionChange,
  deleteAllChanges,
  getChangeCount,
} from "@/lib/change-buffer";

describe("change-buffer", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  describe("getChangesForApp", () => {
    it("returns empty array when no changes exist", () => {
      expect(getChangesForApp("app-1")).toEqual([]);
    });

    it("returns all changes for an app", () => {
      insertChange("app-1", "store-listing", "v1", { title: "Hello" }, { title: "Old" });
      insertChange("app-1", "keywords", "v1", { kw: "test" }, {});

      const changes = getChangesForApp("app-1");
      expect(changes).toHaveLength(2);
      expect(changes[0].section).toBe("store-listing");
      expect(changes[0].data).toEqual({ title: "Hello" });
      expect(changes[1].section).toBe("keywords");
    });

    it("does not return changes for other apps", () => {
      insertChange("app-1", "store-listing", "v1", { a: 1 }, {});
      insertChange("app-2", "store-listing", "v1", { b: 2 }, {});

      expect(getChangesForApp("app-1")).toHaveLength(1);
      expect(getChangesForApp("app-2")).toHaveLength(1);
    });
  });

  describe("getSectionChange", () => {
    it("returns null when no change exists", () => {
      expect(getSectionChange("app-1", "store-listing", "v1")).toBeNull();
    });

    it("returns the matching change", () => {
      insertChange("app-1", "store-listing", "v1", { title: "Hi" }, { title: "Old" });

      const change = getSectionChange("app-1", "store-listing", "v1");
      expect(change).not.toBeNull();
      expect(change!.data).toEqual({ title: "Hi" });
      expect(change!.originalData).toEqual({ title: "Old" });
    });

    it("deserializes null originalValue as empty object", () => {
      testDb.insert(schema.pendingChanges).values({
        id: "c-1",
        appId: "app-1",
        section: "details",
        scope: "info-1",
        field: "all",
        value: JSON.stringify({ x: 1 }),
        originalValue: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      }).run();

      const change = getSectionChange("app-1", "details", "info-1");
      expect(change!.originalData).toEqual({});
    });
  });

  describe("upsertSectionChange", () => {
    it("inserts a new change when none exists", () => {
      upsertSectionChange("app-1", "store-listing", "v1", { title: "New" }, { title: "Orig" });

      const change = getSectionChange("app-1", "store-listing", "v1");
      expect(change).not.toBeNull();
      expect(change!.data).toEqual({ title: "New" });
      expect(change!.originalData).toEqual({ title: "Orig" });
    });

    it("updates an existing change", () => {
      insertChange("app-1", "store-listing", "v1", { title: "First" }, { title: "Orig" });

      upsertSectionChange("app-1", "store-listing", "v1", { title: "Updated" }, { title: "Orig" });

      const changes = getChangesForApp("app-1");
      expect(changes).toHaveLength(1);
      expect(changes[0].data).toEqual({ title: "Updated" });
    });
  });

  describe("deleteSectionChange", () => {
    it("removes a specific section change", () => {
      insertChange("app-1", "store-listing", "v1", { a: 1 }, {});
      insertChange("app-1", "keywords", "v1", { b: 2 }, {});

      deleteSectionChange("app-1", "store-listing", "v1");

      expect(getChangesForApp("app-1")).toHaveLength(1);
      expect(getChangesForApp("app-1")[0].section).toBe("keywords");
    });

    it("does nothing when the change does not exist", () => {
      deleteSectionChange("app-1", "store-listing", "v1");
      expect(getChangesForApp("app-1")).toEqual([]);
    });
  });

  describe("deleteAllChanges", () => {
    it("removes all changes for an app", () => {
      insertChange("app-1", "store-listing", "v1", { a: 1 }, {});
      insertChange("app-1", "keywords", "v1", { b: 2 }, {});
      insertChange("app-2", "store-listing", "v2", { c: 3 }, {});

      deleteAllChanges("app-1");

      expect(getChangesForApp("app-1")).toEqual([]);
      expect(getChangesForApp("app-2")).toHaveLength(1);
    });
  });

  describe("getChangeCount", () => {
    it("returns 0 when no changes exist", () => {
      expect(getChangeCount()).toBe(0);
    });

    it("returns total count across all apps", () => {
      insertChange("app-1", "store-listing", "v1", { a: 1 }, {});
      insertChange("app-2", "keywords", "v1", { b: 2 }, {});

      expect(getChangeCount()).toBe(2);
    });

    it("returns count filtered by appId", () => {
      insertChange("app-1", "store-listing", "v1", { a: 1 }, {});
      insertChange("app-1", "keywords", "v1", { b: 2 }, {});
      insertChange("app-2", "details", "info-1", { c: 3 }, {});

      expect(getChangeCount("app-1")).toBe(2);
      expect(getChangeCount("app-2")).toBe(1);
    });
  });

  // Helper to insert a change row directly
  let changeCounter = 0;
  function insertChange(
    appId: string,
    section: string,
    scope: string,
    data: Record<string, unknown>,
    originalData: Record<string, unknown>,
  ) {
    changeCounter++;
    testDb.insert(schema.pendingChanges).values({
      id: `change-${changeCounter}`,
      appId,
      section,
      scope,
      field: "all",
      value: JSON.stringify(data),
      originalValue: JSON.stringify(originalData),
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    }).run();
  }
});
