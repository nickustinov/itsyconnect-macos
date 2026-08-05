// ---------- Constants ----------

export const ANALYTICS_TTL = 60 * 60 * 1000; // 1 hour (sync worker refreshes hourly)
export const ANALYTICS_EMPTY_RETRY_TTL = 10 * 60 * 1000; // 10 min (faster retry while ASC is still provisioning reports)
export const REPORT_ID_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days (report request/report IDs never change)
export const INSTANCE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days (immutable past data)
export const TODAY_TTL = 10 * 60 * 1000; // 10 min (today's data may update)
export const PERF_METRICS_TTL = 6 * 60 * 60 * 1000; // 6 hours (changes only on new version releases)
export const GAP_PERMANENT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days (Apple genuinely has no data for the gap)
export const GAP_RETRY_TTL = 2 * 60 * 60 * 1000; // 2 hours (gap from a failed fetch – retry sooner, Apple may recover)

// ---------- Exported types ----------

export interface PerfMetricPoint {
  version: string;
  value: number;
}

export interface PerfMetricDataset {
  percentile: string;
  device: string;
  points: PerfMetricPoint[];
}

export interface PerfMetricSeries {
  category: string;
  metric: string;
  unit: string;
  platform: string;
  datasets: PerfMetricDataset[];
}

export interface PerfRegression {
  metric: string;
  metricCategory: string;
  latestVersion: string;
  summary: string;
}

export interface AnalyticsData {
  dailyDownloads: Array<{ date: string; firstTime: number; redownload: number; update: number }>;
  dailyRevenue: Array<{ date: string; proceeds: number; sales: number }>;
  dailyEngagement: Array<{ date: string; impressions: number; pageViews: number }>;
  dailySessions: Array<{ date: string; sessions: number; uniqueDevices: number; avgDuration: number }>;
  dailyInstallsDeletes: Array<{ date: string; installs: number; deletes: number }>;
  dailyDownloadsBySource: Array<{ date: string; search: number; browse: number; webReferrer: number; unavailable: number }>;
  dailyVersionSessions: Array<{ date: string; [version: string]: number | string }>;
  dailyOptIn: Array<{ date: string; downloading: number; optingIn: number }>;
  dailyWebPreview: Array<{ date: string; pageViews: number; appStoreTaps: number }>;
  dailyTerritoryDownloads: Array<{ date: string; code: string; downloads: number }>;
  territories: Array<{ territory: string; code: string; downloads: number; revenue: number }>;
  discoverySources: Array<{ source: string; count: number; fill: string }>;
  crashesByVersion: Array<{ version: string; platform: string; crashes: number; uniqueDevices: number }>;
  crashesByDevice: Array<{ device: string; crashes: number; uniqueDevices: number }>;
  dailyCrashes: Array<{ date: string; crashes: number; uniqueDevices: number }>;
  perfMetrics: PerfMetricSeries[];
  perfRegressions: PerfRegression[];
}

// ---------- Internal types (exported for cross-module use) ----------

export interface AscReportRequest {
  id: string;
  attributes: { accessType: string; [key: string]: unknown };
}

export interface AscReport {
  id: string;
  attributes: { name: string; category: string };
}

export interface AscReportInstance {
  id: string;
  attributes: { processingDate: string; granularity: string };
}

export interface AscReportSegment {
  id: string;
  attributes: { url: string; checksum: string };
}

export interface AscListResponse<T> {
  data: T[];
  links?: { next?: string };
}

export interface PerfPowerMetricsResponse {
  insights?: {
    regressions?: Array<{
      metric: string;
      metricCategory: string;
      latestVersion: string;
      summaryString: string;
    }>;
  };
  productData?: Array<{
    platform: string;
    metricCategories?: Array<{
      identifier: string;
      metrics?: Array<{
        identifier: string;
        unit?: { displayName: string };
        datasets?: Array<{
          filterCriteria?: { device?: string; percentile?: string };
          points?: Array<{ version: string; value: number }>;
        }>;
      }>;
    }>;
  }>;
}

// ---------- TSV parsing ----------

export function parseTsv(raw: string): Array<Record<string, string>> {
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      record[headers[i]] = (values[i] ?? "").replace(/^"|"$/g, "");
    }
    return record;
  });
}

/**
 * Append every element of `source` to `target`.
 *
 * Use this instead of `target.push(...source)`: the spread passes each element
 * as a separate argument, so it exceeds the engine's argument-count limit once
 * `source` holds roughly 100k+ elements. V8 reports that as
 * "RangeError: Maximum call stack size exceeded", which is misleading – it is
 * an argument-count limit, not stack recursion. Analytics snapshot instances
 * routinely exceed it (a single App Downloads instance can hold 300k+ rows).
 */
export function pushAll<T>(target: T[], source: readonly T[]): void {
  for (const item of source) target.push(item);
}

// ---------- Helpers ----------

export function emptyAnalyticsData(): AnalyticsData {
  return {
    dailyDownloads: [],
    dailyRevenue: [],
    dailyEngagement: [],
    dailySessions: [],
    dailyInstallsDeletes: [],
    dailyDownloadsBySource: [],
    dailyTerritoryDownloads: [],
    dailyVersionSessions: [],
    dailyOptIn: [],
    dailyWebPreview: [],
    territories: [],
    discoverySources: [],
    crashesByVersion: [],
    crashesByDevice: [],
    dailyCrashes: [],
    perfMetrics: [],
    perfRegressions: [],
  };
}

// ---------- Accumulation / merge ----------

/** Union two lists by a stable key; entries in `fresh` win over same-key entries in `existing`. */
function mergeByKey<T>(existing: T[], fresh: T[], keyOf: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of existing) map.set(keyOf(item), item);
  for (const item of fresh) map.set(keyOf(item), item);
  return [...map.values()];
}

/**
 * Pick the list with the larger total – used for window-cumulative aggregates
 * (territories, discovery sources, crash totals) that can't be merged per-day.
 * A shorter window from Apple never shrinks what we already accumulated.
 */
function preferLargerSum<T>(existing: T[], fresh: T[], sumOf: (item: T) => number): T[] {
  const total = (list: T[]) => list.reduce((acc, item) => acc + sumOf(item), 0);
  return total(fresh) >= total(existing) ? fresh : existing;
}

/**
 * Accumulate freshly fetched analytics into what we already have. Apple sometimes
 * hides parts of historic data; merging by date means we keep previously fetched
 * points and only let fresh data override the same day, so history is never erased.
 */
export function mergeAnalyticsData(existing: AnalyticsData, fresh: AnalyticsData): AnalyticsData {
  const byDate = <T extends { date: string }>(e: T[], f: T[]): T[] =>
    mergeByKey(e, f, (r) => r.date).sort((a, b) => a.date.localeCompare(b.date));

  return {
    dailyDownloads: byDate(existing.dailyDownloads, fresh.dailyDownloads),
    dailyRevenue: byDate(existing.dailyRevenue, fresh.dailyRevenue),
    dailyEngagement: byDate(existing.dailyEngagement, fresh.dailyEngagement),
    dailySessions: byDate(existing.dailySessions, fresh.dailySessions),
    dailyInstallsDeletes: byDate(existing.dailyInstallsDeletes, fresh.dailyInstallsDeletes),
    dailyDownloadsBySource: byDate(existing.dailyDownloadsBySource, fresh.dailyDownloadsBySource),
    dailyVersionSessions: byDate(existing.dailyVersionSessions, fresh.dailyVersionSessions),
    dailyOptIn: byDate(existing.dailyOptIn, fresh.dailyOptIn),
    dailyWebPreview: byDate(existing.dailyWebPreview, fresh.dailyWebPreview),
    dailyTerritoryDownloads: mergeByKey(
      existing.dailyTerritoryDownloads,
      fresh.dailyTerritoryDownloads,
      (r) => `${r.date}:${r.code}`,
    ).sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code)),
    dailyCrashes: byDate(existing.dailyCrashes, fresh.dailyCrashes),
    territories: preferLargerSum(existing.territories, fresh.territories, (r) => r.downloads),
    discoverySources: preferLargerSum(existing.discoverySources, fresh.discoverySources, (r) => r.count),
    crashesByVersion: preferLargerSum(existing.crashesByVersion, fresh.crashesByVersion, (r) => r.crashes),
    crashesByDevice: preferLargerSum(existing.crashesByDevice, fresh.crashesByDevice, (r) => r.crashes),
    perfMetrics: fresh.perfMetrics.length > 0 ? fresh.perfMetrics : existing.perfMetrics,
    perfRegressions: fresh.perfRegressions.length > 0 ? fresh.perfRegressions : existing.perfRegressions,
  };
}

// ---------- Gap detection (for auto-backfill) ----------

/** Gaps of more than one day between consecutive dates in a YYYY-MM-DD list. */
export function findDateGaps(dates: string[]): Array<{ from: string; to: string; missingDays: number }> {
  const present = [...new Set(dates)].sort();
  const gaps: Array<{ from: string; to: string; missingDays: number }> = [];
  for (let i = 1; i < present.length; i++) {
    const days = Math.round(
      (Date.parse(`${present[i]}T00:00:00Z`) - Date.parse(`${present[i - 1]}T00:00:00Z`)) / 86_400_000,
    );
    if (days > 1) gaps.push({ from: present[i - 1], to: present[i], missingDays: days - 1 });
  }
  return gaps;
}

/** Ignore single sporadic no-data days; only gaps this long are worth re-fetching. */
export const MIN_BACKFILL_GAP_DAYS = 3;

/**
 * Stable signature of the significant gaps in the daily downloads series. An
 * empty string means no significant gap. Used to trigger an auto-backfill when a
 * new gap appears and to avoid re-fetching gaps Apple genuinely doesn't have.
 */
export function downloadGapSignature(data: AnalyticsData): string {
  return findDateGaps(data.dailyDownloads.map((d) => d.date))
    .filter((g) => g.missingDays >= MIN_BACKFILL_GAP_DAYS)
    .map((g) => `${g.from}_${g.to}`)
    .join(",");
}

export function hasAnyAnalyticsRows(data: AnalyticsData): boolean {
  return data.dailyDownloads.length > 0
    || data.dailyRevenue.length > 0
    || data.dailyEngagement.length > 0
    || data.dailySessions.length > 0
    || data.dailyInstallsDeletes.length > 0
    || data.dailyDownloadsBySource.length > 0
    || data.dailyTerritoryDownloads.length > 0
    || data.dailyVersionSessions.length > 0
    || data.dailyOptIn.length > 0
    || data.dailyWebPreview.length > 0
    || data.territories.length > 0
    || data.discoverySources.length > 0
    || data.crashesByVersion.length > 0
    || data.crashesByDevice.length > 0
    || data.dailyCrashes.length > 0;
}
