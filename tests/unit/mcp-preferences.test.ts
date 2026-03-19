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
  getMcpEnabled,
  setMcpEnabled,
  getMcpPort,
  setMcpPort,
} from "@/lib/mcp-preferences";

describe("mcp-preferences", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockRun.mockReset();
  });

  describe("getMcpEnabled", () => {
    it("returns false when no preference is set", () => {
      mockGet.mockReturnValue(undefined);
      expect(getMcpEnabled()).toBe(false);
    });

    it("returns true when set to 'true'", () => {
      mockGet.mockReturnValue({ value: "true" });
      expect(getMcpEnabled()).toBe(true);
    });

    it("returns false when set to anything other than 'true'", () => {
      mockGet.mockReturnValue({ value: "false" });
      expect(getMcpEnabled()).toBe(false);
    });

    it("returns false when db throws", () => {
      mockGet.mockImplementation(() => { throw new Error("DB error"); });
      expect(getMcpEnabled()).toBe(false);
    });
  });

  describe("setMcpEnabled", () => {
    it("stores the preference", () => {
      setMcpEnabled(true);
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe("getMcpPort", () => {
    it("returns default port 3100 when no preference is set", () => {
      mockGet.mockReturnValue(undefined);
      expect(getMcpPort()).toBe(3100);
    });

    it("returns stored port", () => {
      mockGet.mockReturnValue({ value: "4200" });
      expect(getMcpPort()).toBe(4200);
    });

    it("returns default port for out-of-range values (below 1024)", () => {
      mockGet.mockReturnValue({ value: "80" });
      expect(getMcpPort()).toBe(3100);
    });

    it("returns default port for out-of-range values (above 65535)", () => {
      mockGet.mockReturnValue({ value: "70000" });
      expect(getMcpPort()).toBe(3100);
    });

    it("returns default port for non-numeric values", () => {
      mockGet.mockReturnValue({ value: "abc" });
      expect(getMcpPort()).toBe(3100);
    });

    it("returns default port when db throws", () => {
      mockGet.mockImplementation(() => { throw new Error("DB error"); });
      expect(getMcpPort()).toBe(3100);
    });
  });

  describe("setMcpPort", () => {
    it("stores the port", () => {
      setMcpPort(5000);
      expect(mockRun).toHaveBeenCalled();
    });
  });
});
