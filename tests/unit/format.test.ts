import { describe, it, expect } from "vitest";
import {
  formatDateShort,
  formatDate,
  formatDateTime,
  formatDateTimeLong,
  formatDuration,
  isValidUrl,
} from "@/lib/format";

describe("format", () => {
  describe("formatDateShort", () => {
    it("formats a date as 'day short-month' without year", () => {
      const result = formatDateShort("2026-01-27");
      expect(result).toContain("27");
      expect(result).toContain("Jan");
      expect(result).not.toContain("2026");
    });
  });

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

  describe("formatDuration", () => {
    it("formats seconds under a minute", () => {
      expect(formatDuration(45)).toBe("45s");
    });

    it("rounds fractional seconds", () => {
      expect(formatDuration(0.4)).toBe("0s");
      expect(formatDuration(59.6)).toBe("60s");
    });

    it("formats minutes without remainder", () => {
      expect(formatDuration(120)).toBe("2m");
    });

    it("formats minutes with seconds in long form", () => {
      expect(formatDuration(150)).toBe("2m 30s");
    });

    it("formats minutes compact (drops seconds)", () => {
      expect(formatDuration(150, true)).toBe("2m");
    });

    it("formats exact minutes compact", () => {
      expect(formatDuration(120, true)).toBe("2m");
    });

    it("formats hours without remainder", () => {
      expect(formatDuration(7200)).toBe("2h");
    });

    it("formats hours with minutes in long form", () => {
      expect(formatDuration(8100)).toBe("2h 15m");
    });

    it("formats hours compact (drops minutes)", () => {
      expect(formatDuration(8100, true)).toBe("2h");
    });

    it("formats exact hours compact", () => {
      expect(formatDuration(3600, true)).toBe("1h");
    });
  });

  describe("isValidUrl", () => {
    it("returns true for empty string (optional field)", () => {
      expect(isValidUrl("")).toBe(true);
    });

    it("returns true for valid http URL", () => {
      expect(isValidUrl("http://example.com")).toBe(true);
    });

    it("returns true for valid https URL", () => {
      expect(isValidUrl("https://example.com/path")).toBe(true);
    });

    it("returns false for non-http protocol", () => {
      expect(isValidUrl("ftp://example.com")).toBe(false);
    });

    it("returns false for invalid URL", () => {
      expect(isValidUrl("not a url")).toBe(false);
    });

    it("returns false for hostname without dot", () => {
      expect(isValidUrl("http://localhost")).toBe(false);
    });

    it("returns false for hostname with special characters", () => {
      expect(isValidUrl("https://exam ple.com")).toBe(false);
    });
  });
});
