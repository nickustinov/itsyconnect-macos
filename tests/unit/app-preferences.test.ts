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
  getReviewBeforeSaving,
  setReviewBeforeSaving,
  getAIGuidance,
  setAIGuidance,
} from "@/lib/app-preferences";

describe("app-preferences", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockRun.mockReset();
  });

  describe("getAIGuidance", () => {
    it("returns an empty string when no guidance is set", () => {
      mockGet.mockReturnValue(undefined);
      expect(getAIGuidance("translation")).toBe("");
    });

    it("returns the stored guidance text for a scope", () => {
      mockGet.mockReturnValue({ value: "use an informal tone" });
      expect(getAIGuidance("translation")).toBe("use an informal tone");
    });

    it("returns an empty string when db throws", () => {
      mockGet.mockImplementation(() => { throw new Error("DB error"); });
      expect(getAIGuidance("reviews")).toBe("");
    });
  });

  describe("setAIGuidance", () => {
    it("inserts or updates the guidance for a scope", () => {
      setAIGuidance("reviews", "always sign off as me, not us");
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
