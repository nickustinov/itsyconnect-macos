const RANGE_STORAGE_KEY = "range:analytics";

/** Read the effective range string from URL param with localStorage fallback. */
export function getStoredRange(): string | null {
  try {
    return localStorage.getItem(RANGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredRange(range: string | null): void {
  try {
    if (range === null) localStorage.removeItem(RANGE_STORAGE_KEY);
    else localStorage.setItem(RANGE_STORAGE_KEY, range);
  } catch { /* ignore */ }
}

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  label: string;
}

const PRESET_DAYS: Record<string, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, month: number): string {
  // month is 1-based; Date(year, month, 0) gives last day of that month
  const d = new Date(year, month, 0);
  return d.toISOString().slice(0, 10);
}

function monthLabel(year: number, month: number): string {
  const d = new Date(year, month - 1);
  return d.toLocaleString("en", { month: "long", year: "numeric" });
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const CUSTOM_RE = /^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a range string into a DateRange.
 * @param anchor – the last date with available data (e.g. yesterday).
 *   Presets like "7d" end on this date instead of today.
 */
export function parseRange(range: string | null, anchor?: string): DateRange {
  if (!range) {
    return presetRange("30d", anchor);
  }

  // Preset: 1d, 7d, 30d, 90d
  if (range in PRESET_DAYS) {
    return presetRange(range, anchor);
  }

  // Month: 2026-02
  if (MONTH_RE.test(range)) {
    const [yearStr, monthStr] = range.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    return {
      from: `${range}-01`,
      to: lastDayOfMonth(year, month),
      label: monthLabel(year, month),
    };
  }

  // Custom: 2025-12-01..2026-02-28
  if (CUSTOM_RE.test(range)) {
    const [from, to] = range.split("..");
    return { from, to, label: formatCustomLabel(from, to) };
  }

  // Invalid – fall back to 30d
  return presetRange("30d", anchor);
}

function presetRange(key: string, anchor?: string): DateRange {
  const days = PRESET_DAYS[key]!;
  const endDate = anchor ?? todayStr();
  const from = subtractDays(endDate, days - 1);
  return {
    from,
    to: endDate,
    label: days === 1 ? "Last day" : `Last ${days} days`,
  };
}

function formatCustomLabel(from: string, to: string): string {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to + "T00:00:00");
  const fmtFrom = f.toLocaleDateString("en", { month: "short", day: "numeric" });
  const fmtTo = t.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
  return `${fmtFrom} \u2013 ${fmtTo}`;
}

/**
 * Compute percentage change between current and previous period.
 * Returns null when comparison is meaningless:
 * - previous value is 0
 * - previous period has less than 50% of current period's data coverage
 */
export function pctChange(
  current: number,
  previous: number,
  currentDays: number,
  previousDays: number,
): string | null {
  if (previous === 0) return null;
  if (previousDays < currentDays * 0.5) return null;
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}% from previous period`;
}

export function filterByDateRange<T extends { date: string }>(
  data: T[],
  range: DateRange,
): T[] {
  const filtered = data.filter((d) => d.date >= range.from && d.date <= range.to);
  if (filtered.length === 0) return filtered;

  const byDate = new Map<string, T>();
  for (const d of filtered) byDate.set(d.date, d);

  const template = {} as Record<string, unknown>;
  for (const [key, val] of Object.entries(filtered[0])) {
    template[key] = typeof val === "number" ? 0 : val;
  }

  const result: T[] = [];
  const cur = new Date(range.from + "T00:00:00");
  const end = new Date(range.to + "T00:00:00");
  const today = new Date().toISOString().slice(0, 10);
  while (cur <= end) {
    const dateStr = cur.toISOString().slice(0, 10);
    const existing = byDate.get(dateStr);
    if (existing) {
      result.push(existing);
    } else if (dateStr < today) {
      result.push({ ...template, date: dateStr } as T);
    }
    cur.setDate(cur.getDate() + 1);
  }

  return result;
}

/**
 * Compute the previous period of equal length for comparison KPIs.
 */
export function previousRange(range: DateRange): DateRange {
  const fromDate = new Date(range.from + "T00:00:00");
  const toDate = new Date(range.to + "T00:00:00");
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const prevTo = subtractDays(range.from, 1);
  const prevFrom = subtractDays(range.from, days);
  return { from: prevFrom, to: prevTo, label: "Previous period" };
}
