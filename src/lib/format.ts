/** BCP 47 date-formatting locale per app locale. */
const DATE_LOCALES: Record<string, string> = {
  en: "en-GB",
  "zh-CN": "zh-CN",
  fr: "fr",
  de: "de",
  ru: "ru",
};

let dateLocale = "en-GB";

/** Set by LocaleProvider so all date formatting follows the active app locale. */
export function setDateLocale(appLocale: string): void {
  dateLocale = DATE_LOCALES[appLocale] ?? "en-GB";
}

/** The BCP 47 locale for date formatting outside these helpers. */
export function getDateLocale(): string {
  return dateLocale;
}

/** Format a date string as "27 Jan" (day + short month, no year). */
export function formatDateShort(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(dateLocale, {
    day: "numeric",
    month: "short",
  });
}

/** Format an ISO date string as "1 Jan 2026". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(dateLocale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Format an ISO date string as "1 Jan 2026, 14:30". */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString(dateLocale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format an ISO date string as "1 January 2026, 14:30". */
export function formatDateTimeLong(iso: string): string {
  return new Date(iso).toLocaleDateString(dateLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a duration in seconds to a human-readable string.
 * Compact form for axis ticks: "45s", "12m", "2.5h"
 * Long form for tooltips: "45s", "12m 30s", "2h 15m"
 */
export function formatDuration(seconds: number, compact = false): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    if (compact) return s === 0 ? `${m}m` : `${m}m`;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (compact) return m === 0 ? `${h}h` : `${h}h`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Encode an app version for use as a chart data key (dots are not CSS-safe). */
export function encodeVersionSessionKey(version: string): string {
  return `v${version.replace(/\./g, "_")}`;
}

/** Format an encoded version key for display (e.g. v1_18_0 → v1.18.0). */
export function formatVersionSessionLabel(key: string): string {
  if (!key.startsWith("v")) return key;
  return `v${key.slice(1).replace(/_/g, ".")}`;
}

/** Check if a string is a valid HTTP(S) URL. Empty strings return true (optional fields). */
export function isValidUrl(s: string): boolean {
  if (!s) return true;
  try {
    const url = new URL(s);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    // Hostname must be a valid domain (letters, digits, hyphens, dots only)
    return /^[a-zA-Z0-9.-]+$/.test(url.hostname) && url.hostname.includes(".");
  } catch { return false; }
}
