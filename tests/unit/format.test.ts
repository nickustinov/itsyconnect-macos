import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatDateTimeLong } from "@/lib/format";

describe("format", () => {
  describe("formatDate", () => {
    it("formats an ISO date as 'day short-month year'", () => {
      expect(formatDate("2026-02-15T10:00:00Z")).toMatch(/15 Feb 2026/);
    });
  });

  describe("formatDateTime", () => {
    it("formats with short month, date, year, and time", () => {
      const result = formatDateTime("2026-02-15T14:30:00Z");
      expect(result).toContain("15");
      expect(result).toContain("Feb");
      expect(result).toContain("2026");
    });
  });

  describe("formatDateTimeLong", () => {
    it("formats with long month, date, year, and time", () => {
      const result = formatDateTimeLong("2026-02-15T14:30:00Z");
      expect(result).toContain("15");
      expect(result).toContain("February");
      expect(result).toContain("2026");
    });
  });
});
