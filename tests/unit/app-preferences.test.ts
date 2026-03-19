import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockRun = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: mockGet,
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          run: mockRun,
        }),
      }),
    }),
    delete: () => ({
      where: () => ({
        run: mockRun,
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  appPreferences: {
    key: "key",
    value: "value",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: string) => ({ col, val }),
}));

import {
  clearFreeSelectedAppId,
  getFreeSelectedAppId,
  setFreeSelectedAppId,
  getReviewBeforeSaving,
  setReviewBeforeSaving,
} from "@/lib/app-preferences";

describe("app-preferences", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockRun.mockReset();
  });

  describe("getFreeSelectedAppId", () => {
    it("returns null when no preference is set", () => {
      mockGet.mockReturnValue(undefined);
      expect(getFreeSelectedAppId()).toBeNull();
    });

    it("returns the stored app ID", () => {
      mockGet.mockReturnValue({ value: "app-123" });
      expect(getFreeSelectedAppId()).toBe("app-123");
    });

    it("returns null when db throws", () => {
      mockGet.mockImplementation(() => { throw new Error("DB error"); });
      expect(getFreeSelectedAppId()).toBeNull();
    });
  });

  describe("setFreeSelectedAppId", () => {
    it("inserts or updates the preference", () => {
      setFreeSelectedAppId("app-456");
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe("clearFreeSelectedAppId", () => {
    it("deletes the stored preference", () => {
      clearFreeSelectedAppId();
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe("getReviewBeforeSaving", () => {
    it("returns false when no preference is set", () => {
      mockGet.mockReturnValue(undefined);
      expect(getReviewBeforeSaving()).toBe(false);
    });

    it("returns true when set to 'true'", () => {
      mockGet.mockReturnValue({ value: "true" });
      expect(getReviewBeforeSaving()).toBe(true);
    });

    it("returns false when set to anything other than 'true'", () => {
      mockGet.mockReturnValue({ value: "false" });
      expect(getReviewBeforeSaving()).toBe(false);
    });

    it("returns false when db throws", () => {
      mockGet.mockImplementation(() => { throw new Error("DB error"); });
      expect(getReviewBeforeSaving()).toBe(false);
    });
  });

  describe("setReviewBeforeSaving", () => {
    it("inserts or updates the preference", () => {
      setReviewBeforeSaving(true);
      expect(mockRun).toHaveBeenCalled();
    });

    it("stores false as a string", () => {
      setReviewBeforeSaving(false);
      expect(mockRun).toHaveBeenCalled();
    });
  });
});
