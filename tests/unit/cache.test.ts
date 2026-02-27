import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../helpers/test-db";
import { cacheEntries } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  cacheGet,
  cacheSet,
  cacheInvalidate,
  cacheInvalidatePrefix,
  cacheGetMeta,
} from "@/lib/cache";

describe("cache", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  describe("cacheGet", () => {
    it("returns null for missing resource", () => {
      expect(cacheGet("nonexistent")).toBeNull();
    });

    it("returns fresh data", () => {
      cacheSet("apps", [{ id: "1" }], 3_600_000);
      expect(cacheGet("apps")).toEqual([{ id: "1" }]);
    });

    it("returns null for stale data", () => {
      // Insert with fetchedAt in the past
      cacheSet("apps", [{ id: "1" }], 1000);
      // Manually backdate the entry
      testDb
        .update(cacheEntries)
        .set({ fetchedAt: Date.now() - 5000 })
        .where(eq(cacheEntries.resource, "apps"))
        .run();
      expect(cacheGet("apps")).toBeNull();
    });
  });

  describe("cacheSet", () => {
    it("stores data that can be retrieved", () => {
      cacheSet("key", { hello: "world" }, 60_000);
      expect(cacheGet("key")).toEqual({ hello: "world" });
    });

    it("upserts on conflict", () => {
      cacheSet("key", "first", 60_000);
      cacheSet("key", "second", 60_000);
      expect(cacheGet("key")).toBe("second");
    });
  });

  describe("cacheInvalidate", () => {
    it("removes a specific resource", () => {
      cacheSet("apps", [], 60_000);
      cacheSet("versions", [], 60_000);
      cacheInvalidate("apps");
      expect(cacheGet("apps")).toBeNull();
      expect(cacheGet("versions")).toEqual([]);
    });

    it("is a no-op for missing resource", () => {
      expect(() => cacheInvalidate("nonexistent")).not.toThrow();
    });
  });

  describe("cacheInvalidatePrefix", () => {
    it("removes all resources matching the prefix", () => {
      cacheSet("versions:app-1", [], 60_000);
      cacheSet("versions:app-2", [], 60_000);
      cacheSet("apps", [], 60_000);
      cacheInvalidatePrefix("versions:");
      expect(cacheGet("versions:app-1")).toBeNull();
      expect(cacheGet("versions:app-2")).toBeNull();
      expect(cacheGet("apps")).toEqual([]);
    });
  });

  describe("cacheGetMeta", () => {
    it("returns null for missing resource", () => {
      expect(cacheGetMeta("nonexistent")).toBeNull();
    });

    it("returns fetchedAt and ttlMs for existing resource", () => {
      const before = Date.now();
      cacheSet("apps", [], 3_600_000);
      const meta = cacheGetMeta("apps");
      expect(meta).not.toBeNull();
      expect(meta!.fetchedAt).toBeGreaterThanOrEqual(before);
      expect(meta!.ttlMs).toBe(3_600_000);
    });
  });
});
