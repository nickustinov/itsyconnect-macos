/** Format a date string as "27 Jan" (day + short month, no year). */
export function formatDateShort(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/** Format an ISO date string as "1 Jan 2026". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Format an ISO date string as "1 Jan 2026, 14:30". */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format an ISO date string as "1 January 2026, 14:30". */
export function formatDateTimeLong(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
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
