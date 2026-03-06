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
});
