import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseRange, filterByDateRange, previousRange, pctChange, getStoredRange, setStoredRange } from "@/lib/analytics-range";

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
vi.stubGlobal("localStorage", mockLocalStorage);

// Fix "today" to 2026-02-28 for deterministic tests
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-02-28T12:00:00Z"));
  mockLocalStorage.getItem.mockReset();
  mockLocalStorage.setItem.mockReset();
  mockLocalStorage.removeItem.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------- parseRange (no anchor – falls back to today) ----------

describe("parseRange", () => {
  it("defaults to 30d when range is null", () => {
    const r = parseRange(null);
    expect(r.from).toBe("2026-01-30");
    expect(r.to).toBe("2026-02-28");
    expect(r.label).toBe("Last 30 days");
  });

  it("parses 1d preset", () => {
    const r = parseRange("1d");
    expect(r.from).toBe("2026-02-28");
    expect(r.to).toBe("2026-02-28");
    expect(r.label).toBe("Last day");
  });

  it("parses 7d preset", () => {
    const r = parseRange("7d");
    expect(r.from).toBe("2026-02-22");
    expect(r.to).toBe("2026-02-28");
    expect(r.label).toBe("Last 7 days");
  });

  it("parses 30d preset", () => {
    const r = parseRange("30d");
    expect(r.from).toBe("2026-01-30");
    expect(r.to).toBe("2026-02-28");
    expect(r.label).toBe("Last 30 days");
  });

  it("parses 90d preset", () => {
    const r = parseRange("90d");
    expect(r.from).toBe("2025-12-01");
    expect(r.to).toBe("2026-02-28");
    expect(r.label).toBe("Last 90 days");
  });

  it("parses month format (2026-02)", () => {
    const r = parseRange("2026-02");
    expect(r.from).toBe("2026-02-01");
    expect(r.to).toBe("2026-02-28");
    expect(r.label).toBe("February 2026");
  });

  it("parses month format (2026-01)", () => {
    const r = parseRange("2026-01");
    expect(r.from).toBe("2026-01-01");
    expect(r.to).toBe("2026-01-31");
    expect(r.label).toBe("January 2026");
  });

  it("parses month with 30 days (2025-11)", () => {
    const r = parseRange("2025-11");
    expect(r.from).toBe("2025-11-01");
    expect(r.to).toBe("2025-11-30");
    expect(r.label).toBe("November 2025");
  });

  it("parses custom range", () => {
    const r = parseRange("2025-12-01..2026-02-28");
    expect(r.from).toBe("2025-12-01");
    expect(r.to).toBe("2026-02-28");
    expect(r.label).toMatch(/Dec 1/);
    expect(r.label).toMatch(/Feb 28, 2026/);
    expect(r.label).toContain("\u2013"); // en dash
  });

  it("falls back to 30d on invalid input", () => {
    const r = parseRange("garbage");
    expect(r.from).toBe("2026-01-30");
    expect(r.to).toBe("2026-02-28");
    expect(r.label).toBe("Last 30 days");
  });

  it("falls back to 30d on empty string", () => {
    const r = parseRange("");
    expect(r.from).toBe("2026-01-30");
    expect(r.to).toBe("2026-02-28");
  });

  it("falls back to 30d for unknown preset key", () => {
    const r = parseRange("999d");
    expect(r.from).toBe("2026-01-30");
    expect(r.to).toBe("2026-02-28");
    expect(r.label).toBe("Last 30 days");
  });
});

// ---------- parseRange with anchor ----------

describe("parseRange with anchor", () => {
  const anchor = "2026-02-27";

  it("1d anchors to last available date", () => {
    const r = parseRange("1d", anchor);
    expect(r.from).toBe("2026-02-27");
    expect(r.to).toBe("2026-02-27");
    expect(r.label).toBe("Last day");
  });

  it("7d anchors to last available date", () => {
    const r = parseRange("7d", anchor);
    expect(r.from).toBe("2026-02-21");
    expect(r.to).toBe("2026-02-27");
    expect(r.label).toBe("Last 7 days");
  });

  it("30d anchors to last available date", () => {
    const r = parseRange("30d", anchor);
    expect(r.from).toBe("2026-01-29");
    expect(r.to).toBe("2026-02-27");
    expect(r.label).toBe("Last 30 days");
  });

  it("null defaults to 30d anchored", () => {
    const r = parseRange(null, anchor);
    expect(r.from).toBe("2026-01-29");
    expect(r.to).toBe("2026-02-27");
  });

  it("month range ignores anchor", () => {
    const r = parseRange("2026-02", anchor);
    expect(r.from).toBe("2026-02-01");
    expect(r.to).toBe("2026-02-28");
  });

  it("custom range ignores anchor", () => {
    const r = parseRange("2026-01-01..2026-02-15", anchor);
    expect(r.from).toBe("2026-01-01");
    expect(r.to).toBe("2026-02-15");
  });
});

// ---------- filterByDateRange ----------

describe("filterByDateRange", () => {
  const data = [
    { date: "2026-01-15", value: 1 },
    { date: "2026-01-30", value: 2 },
    { date: "2026-02-01", value: 3 },
    { date: "2026-02-15", value: 4 },
    { date: "2026-02-28", value: 5 },
    { date: "2026-03-01", value: 6 },
  ];

  it("filters to 7d range and fills gaps with 0", () => {
    const range = parseRange("7d");
    const result = filterByDateRange(data, range);
    expect(result).toHaveLength(7);
    expect(result.find((d) => d.date === "2026-02-28")!.value).toBe(5);
    expect(result.find((d) => d.date === "2026-02-25")!.value).toBe(0);
  });

  it("filters to 30d range and fills gaps with 0", () => {
    const range = parseRange("30d");
    const result = filterByDateRange(data, range);
    expect(result).toHaveLength(30);
    expect(result.find((d) => d.date === "2026-01-30")!.value).toBe(2);
    expect(result.find((d) => d.date === "2026-02-01")!.value).toBe(3);
    expect(result.find((d) => d.date === "2026-02-15")!.value).toBe(4);
    expect(result.find((d) => d.date === "2026-02-28")!.value).toBe(5);
    expect(result.find((d) => d.date === "2026-02-10")!.value).toBe(0);
    const dates = result.map((d) => d.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("filters to month range and fills gaps with 0", () => {
    const range = parseRange("2026-02");
    const result = filterByDateRange(data, range);
    expect(result).toHaveLength(28);
    expect(result.find((d) => d.date === "2026-02-01")!.value).toBe(3);
    expect(result.find((d) => d.date === "2026-02-15")!.value).toBe(4);
    expect(result.find((d) => d.date === "2026-02-28")!.value).toBe(5);
    expect(result.find((d) => d.date === "2026-02-05")!.value).toBe(0);
  });

  it("filters to custom range and fills gaps with 0", () => {
    const range = parseRange("2026-01-15..2026-02-01");
    const result = filterByDateRange(data, range);
    expect(result).toHaveLength(18);
    expect(result.find((d) => d.date === "2026-01-15")!.value).toBe(1);
    expect(result.find((d) => d.date === "2026-01-30")!.value).toBe(2);
    expect(result.find((d) => d.date === "2026-02-01")!.value).toBe(3);
    expect(result.find((d) => d.date === "2026-01-20")!.value).toBe(0);
  });

  it("does not autofill today with 0", () => {
    const sparse = [
      { date: "2026-02-26", value: 1 },
      { date: "2026-02-27", value: 2 },
    ];
    const range = parseRange("2026-02-26..2026-02-28");
    const result = filterByDateRange(sparse, range);
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.date)).toEqual(["2026-02-26", "2026-02-27"]);
  });

  it("returns empty array when no data matches", () => {
    const range = parseRange("2025-06");
    const result = filterByDateRange(data, range);
    expect(result).toHaveLength(0);
  });
});

// ---------- pctChange ----------

describe("pctChange", () => {
  it("returns null when previous is 0", () => {
    expect(pctChange(100, 0, 30, 30)).toBeNull();
  });

  it("returns null when previous period coverage < 50%", () => {
    expect(pctChange(100, 5, 30, 14)).toBeNull();
  });

  it("returns percentage string when coverage is sufficient", () => {
    expect(pctChange(150, 100, 30, 28)).toBe("+50.0% from previous period");
  });

  it("returns negative percentage", () => {
    expect(pctChange(50, 100, 30, 30)).toBe("-50.0% from previous period");
  });

  it("edge case: exactly 50% coverage returns the percentage", () => {
    expect(pctChange(200, 100, 30, 15)).toBe("+100.0% from previous period");
  });
});

// ---------- previousRange ----------

describe("previousRange", () => {
  it("computes previous period for 7d", () => {
    const range = parseRange("7d");
    const prev = previousRange(range);
    expect(prev.from).toBe("2026-02-15");
    expect(prev.to).toBe("2026-02-21");
  });

  it("computes previous period for 30d", () => {
    const range = parseRange("30d");
    const prev = previousRange(range);
    expect(prev.from).toBe("2025-12-31");
    expect(prev.to).toBe("2026-01-29");
  });

  it("computes previous period for month", () => {
    const range = parseRange("2026-02");
    const prev = previousRange(range);
    // Feb 2026 has 28 days, so previous 28-day period
    expect(prev.from).toBe("2026-01-04");
    expect(prev.to).toBe("2026-01-31");
  });
});

// ---------- getStoredRange / setStoredRange ----------

describe("getStoredRange", () => {
  it("returns the stored value", () => {
    mockLocalStorage.getItem.mockReturnValue("7d");
    expect(getStoredRange()).toBe("7d");
  });

  it("returns null when localStorage throws", () => {
    mockLocalStorage.getItem.mockImplementation(() => { throw new Error("SecurityError"); });
    expect(getStoredRange()).toBeNull();
  });
});

describe("setStoredRange", () => {
  it("stores the value", () => {
    setStoredRange("30d");
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith("range:analytics", "30d");
  });

  it("removes when null", () => {
    setStoredRange(null);
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith("range:analytics");
  });

  it("ignores errors", () => {
    mockLocalStorage.setItem.mockImplementation(() => { throw new Error("QuotaExceeded"); });
    expect(() => setStoredRange("90d")).not.toThrow();
  });
});
