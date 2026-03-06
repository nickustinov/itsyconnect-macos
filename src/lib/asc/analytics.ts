import { gunzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { ascFetch } from "./client";
import { cacheGet, cacheSet } from "@/lib/cache";
import { db } from "@/db";
import { analyticsBackfill } from "@/db/schema";

const ANALYTICS_TTL = 60 * 60 * 1000; // 1 hour (sync worker refreshes hourly)
const ANALYTICS_EMPTY_RETRY_TTL = 10 * 60 * 1000; // 10 min (faster retry while ASC is still provisioning reports)
const REPORT_ID_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days (report request/report IDs never change)
const INSTANCE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days (immutable past data)
const TODAY_TTL = 10 * 60 * 1000; // 10 min (today's data may update)
const PERF_METRICS_TTL = 6 * 60 * 60 * 1000; // 6 hours (changes only on new version releases)

// ---------- Types ----------

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

interface AscReportRequest {
  id: string;
  attributes: { accessType: string; [key: string]: unknown };
}

interface AscReport {
  id: string;
  attributes: { name: string; category: string };
}

interface AscReportInstance {
  id: string;
  attributes: { processingDate: string; granularity: string };
}

interface AscReportSegment {
  id: string;
  attributes: { url: string; checksum: string };
}

interface AscListResponse<T> {
  data: T[];
  links?: { next?: string };
}

interface PerfPowerMetricsResponse {
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

// ---------- Report request discovery ----------

// In-memory caches – these never change for the lifetime of the process
const reportRequestIdsCache = new Map<string, string[]>();
const reportIdCache = new Map<string, string>();

function normalizeReportName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function findReportRequestIds(appId: string): Promise<string[]> {
  // Tier 1: in-memory
  const memCached = reportRequestIdsCache.get(appId);
  if (memCached && memCached.length > 0) return memCached;

  // Tier 2: SQLite
  const dbKey = `asc-report-requests:${appId}`;
  const dbCached = cacheGet<string[]>(dbKey);
  if (dbCached && dbCached.length > 0) {
    reportRequestIdsCache.set(appId, dbCached);
    return dbCached;
  }

  // Tier 3: API
  const response = await ascFetch<AscListResponse<AscReportRequest>>(
    `/v1/apps/${appId}/analyticsReportRequests`,
  );

  // Collect both ONGOING and ONE_TIME_SNAPSHOT request IDs.
  // ONGOING has recent daily data; SNAPSHOT has historical backfill.
  // Their instances can overlap on data dates – fetchReportData
  // deduplicates rows by data date to prevent double-counting.
  let ids = response.data
    .filter((r) => r.attributes.accessType === "ONGOING" || r.attributes.accessType === "ONE_TIME_SNAPSHOT")
    .map((r) => r.id);

  const requestSummary = response.data.map((r) => {
    const attrs = r.attributes ?? {};
    const accessType = String(attrs.accessType ?? "UNKNOWN");
    const state = typeof attrs.state === "string" ? `, state=${attrs.state}` : "";
    const createdDate = typeof attrs.createdDate === "string" ? `, created=${attrs.createdDate}` : "";
    return `${r.id}(${accessType}${state}${createdDate})`;
  }).join("; ");
  console.log(`[analytics] ${appId}: ${ids.length} usable report requests from ${response.data.length} total`);
  if (requestSummary) {
    console.log(`[analytics] ${appId}: report request details: ${requestSummary}`);
  }
  if (response.data.length > 0 && ids.length === 0) {
    console.warn(`[analytics] ${appId}: report requests exist but none are ONGOING/ONE_TIME_SNAPSHOT`);
  }

  // No report requests exist yet – create both ONGOING (daily going forward)
  // and ONE_TIME_SNAPSHOT (historical backfill). ASC requires a POST before
  // analytics data becomes available. The snapshot takes hours to process
  // but will eventually provide the full history.
  if (ids.length === 0) {
    for (const accessType of ["ONGOING", "ONE_TIME_SNAPSHOT"] as const) {
      try {
        console.log(`[analytics] ${appId}: creating ${accessType} report request`);
        const created = await ascFetch<{ data: { id: string } }>(
          "/v1/analyticsReportRequests",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: {
                type: "analyticsReportRequests",
                attributes: { accessType },
                relationships: {
                  app: { data: { type: "apps", id: appId } },
                },
              },
            }),
          },
        );
        ids.push(created.data.id);
        console.log(`[analytics] ${appId}: created ${accessType} report request ${created.data.id}`);
      } catch (err) {
        console.warn(`[analytics] ${appId}: failed to create ${accessType} report request`, err);
      }
    }
  }

  if (ids.length === 0) {
    console.warn(`[analytics] ${appId}: no usable report request IDs after create attempts`);
  } else {
    console.log(`[analytics] ${appId}: using report request IDs: ${ids.join(", ")}`);
  }

  reportRequestIdsCache.set(appId, ids);
  cacheSet(dbKey, ids, REPORT_ID_TTL);
  return ids;
}

async function findReportId(
  appId: string,
  requestId: string,
  category: string,
  reportName: string,
): Promise<string | null> {
  const key = `${requestId}:${reportName}`;

  // Tier 1: in-memory
  const memCached = reportIdCache.get(key);
  if (memCached) return memCached;

  // Tier 2: SQLite
  const dbKey = `asc-report-id:${key}`;
  const dbCached = cacheGet<string>(dbKey);
  if (dbCached) {
    reportIdCache.set(key, dbCached);
    return dbCached;
  }

  // Tier 3: API
  const reportsResp = await ascFetch<AscListResponse<AscReport>>(
    `/v1/analyticsReportRequests/${requestId}/reports?filter[category]=${category}`,
  );

  console.log(
    `[analytics] ${appId}: request ${requestId} category=${category} returned ${reportsResp.data.length} reports`,
  );

  // Cache all reports from this category for this request
  for (const r of reportsResp.data) {
    const rKey = `${requestId}:${r.attributes.name}`;
    reportIdCache.set(rKey, r.id);
    cacheSet(`asc-report-id:${rKey}`, r.id, REPORT_ID_TTL);
  }

  const exact = reportIdCache.get(key);
  if (exact) return exact;

  // Fallback: tolerate punctuation/spacing/case differences in report names.
  const normalizedExpected = normalizeReportName(reportName);
  const normalizedMatches = reportsResp.data.filter(
    (r) => normalizeReportName(r.attributes.name) === normalizedExpected,
  );
  if (normalizedMatches.length === 1) {
    const matched = normalizedMatches[0]!;
    reportIdCache.set(key, matched.id);
    cacheSet(dbKey, matched.id, REPORT_ID_TTL);
    console.warn(
      `[analytics] ${appId}: report name mismatch for request ${requestId}, using normalized match "${matched.attributes.name}" for expected "${reportName}"`,
    );
    return matched.id;
  }

  const names = reportsResp.data.map((r) => `"${r.attributes.name}"`).join(", ");
  if (reportsResp.data.length === 0) {
    console.warn(`[analytics] ${appId}: request ${requestId} has no reports for category=${category}`);
  } else {
    console.warn(
      `[analytics] ${appId}: report "${reportName}" not found in category=${category} for request ${requestId}. Available: ${names}`,
    );
  }
  return null;
}

// ---------- Concurrency limiter for S3 downloads ----------

// All report types share this limiter so we don't overwhelm S3
// when 8 fetchReportData calls run in parallel.
const MAX_CONCURRENT_DOWNLOADS = 6;
let activeDownloads = 0;
const downloadQueue: Array<() => void> = [];

async function withDownloadSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS) {
    await new Promise<void>((resolve) => downloadQueue.push(resolve));
  }
  activeDownloads++;
  try {
    return await fn();
  } finally {
    activeDownloads--;
    downloadQueue.shift()?.();
  }
}

// ---------- Segment download ----------

const SEGMENT_MAX_RETRIES = 3;
const SEGMENT_RETRY_DELAY_MS = 1000;

async function downloadSegment(url: string): Promise<string> {
  // Pre-signed S3 URL – no auth header, retry on transient network errors
  return withDownloadSlot(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < SEGMENT_MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Segment download failed: ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // Try gzip decompression; if it fails, treat as plain text
        try {
          return gunzipSync(buffer).toString("utf-8");
        } catch {
          return buffer.toString("utf-8");
        }
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error
          ? err.message + String((err as NodeJS.ErrnoException).cause ?? "")
          : "";
        const isTransient =
          err instanceof TypeError ||
          /ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(msg);
        if (!isTransient) throw err;
        if (attempt < SEGMENT_MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, SEGMENT_RETRY_DELAY_MS * (attempt + 1)));
        }
      }
    }
    throw lastError;
  });
}

// ---------- Per-instance fetching with caching ----------

async function downloadInstanceRows(
  instanceId: string,
): Promise<Array<Record<string, string>>> {
  const segResp = await ascFetch<AscListResponse<AscReportSegment>>(
    `/v1/analyticsReportInstances/${instanceId}/segments`,
  );

  const rows: Array<Record<string, string>> = [];
  for (const seg of segResp.data) {
    const tsv = await downloadSegment(seg.attributes.url);
    rows.push(...parseTsv(tsv));
  }
  return rows;
}

// ---------- Report fetching ----------

async function fetchReportData(
  appId: string,
  requestIds: string[],
  category: string,
  reportName: string,
  granularity: string,
  limit: number,
  maxInstances = limit,
): Promise<Array<Record<string, string>>> {
  const today = new Date().toISOString().slice(0, 10);

  // Collect instances, deduplicate by processingDate.
  const seenProcessingDates = new Set<string>();
  const uniqueInstances: AscReportInstance[] = [];
  let matchedRequests = 0;

  for (const requestId of requestIds) {
    const reportId = await findReportId(appId, requestId, category, reportName);
    if (!reportId) {
      console.warn(
        `[analytics] ${appId}: ${category}/${reportName} missing for request ${requestId}`,
      );
      continue;
    }
    matchedRequests++;

    let url: string | undefined =
      `/v1/analyticsReports/${reportId}/instances?filter[granularity]=${granularity}&limit=${Math.min(limit, 200)}`;
    const before = uniqueInstances.length;

    while (url && uniqueInstances.length < maxInstances) {
      const resp: AscListResponse<AscReportInstance> =
        await ascFetch<AscListResponse<AscReportInstance>>(url);

      for (const inst of resp.data) {
        const date = inst.attributes.processingDate;
        if (!seenProcessingDates.has(date)) {
          seenProcessingDates.add(date);
          uniqueInstances.push(inst);
        }
      }

      url = resp.links?.next;
    }
    const added = uniqueInstances.length - before;
    console.log(
      `[analytics] ${appId}: ${category}/${reportName} request ${requestId} report ${reportId} contributed ${added} instances`,
    );
  }

  if (uniqueInstances.length === 0) {
    console.warn(
      `[analytics] ${appId}: ${category}/${reportName} produced 0 instances (matchedRequests=${matchedRequests}/${requestIds.length}, granularity=${granularity})`,
    );
    return [];
  }

  // Download all instances concurrently (semaphore limits S3 requests).
  // Per-instance cache: past days are immutable, today's data may update.
  // We pair each result with its instance so we can inject processingDate
  // as "Date" for reports whose TSV rows lack a Date column (e.g. crashes).
  const instanceResults = await Promise.allSettled(
    uniqueInstances.map(async (instance) => {
      const instanceKey = `analytics-inst:${instance.id}`;
      const isToday = instance.attributes.processingDate === today;

      if (!isToday) {
        const cached = cacheGet<Array<Record<string, string>>>(instanceKey);
        if (cached) return { rows: cached, processingDate: instance.attributes.processingDate };
      }

      const rows = await downloadInstanceRows(instance.id);
      cacheSet(instanceKey, rows, isToday ? TODAY_TTL : INSTANCE_TTL);
      return { rows, processingDate: instance.attributes.processingDate };
    }),
  );

  // Each instance can contain rows for multiple data dates, and
  // consecutive instances overlap (e.g. instance processed on Feb 23
  // contains data for Feb 21–22, while Feb 24's has Feb 22–23).
  // Deduplicate by keeping only the first occurrence of each data date.
  // Instances are ordered newest-first from the API, so the most recent
  // (freshest) data wins for any overlapping date.
  const seenDataDates = new Set<string>();
  const deduped: Array<Record<string, string>> = [];

  for (const result of instanceResults) {
    if (result.status !== "fulfilled") {
      console.warn(`[analytics] Instance download failed:`, result.reason);
      continue;
    }

    const { rows: instanceRows, processingDate } = result.value;

    // Normalize: ensure every row uses uppercase "Date" key.
    // Some reports use lowercase "date"; crash reports omit it entirely
    // (the date is implicit from the instance's processingDate).
    if (instanceRows.length > 0 && !("Date" in instanceRows[0])) {
      const fallback = "date" in instanceRows[0] ? undefined : processingDate;
      for (const row of instanceRows) {
        row["Date"] = fallback ?? row["date"]!;
      }
    }

    // Group this instance's rows by their Date field
    const rowsByDate = new Map<string, Array<Record<string, string>>>();
    for (const row of instanceRows) {
      const date = row["Date"]!;
      if (!date) { deduped.push(row); continue; }
      if (!rowsByDate.has(date)) rowsByDate.set(date, []);
      rowsByDate.get(date)!.push(row);
    }

    for (const [date, rows] of rowsByDate) {
      if (!seenDataDates.has(date)) {
        seenDataDates.add(date);
        deduped.push(...rows);
      }
    }
  }

  console.log(
    `[analytics] ${appId}: ${category}/${reportName} rows deduped to ${deduped.length} rows across ${uniqueInstances.length} instances`,
  );
  return deduped;
}

// ---------- Performance metrics ----------

export async function fetchPerfPowerMetrics(
  appId: string,
): Promise<{ metrics: PerfMetricSeries[]; regressions: PerfRegression[] }> {
  const cacheKey = `perf-metrics:${appId}`;
  const cached = cacheGet<{ metrics: PerfMetricSeries[]; regressions: PerfRegression[] }>(cacheKey);
  if (cached) return cached;

  try {
    const response = await ascFetch<PerfPowerMetricsResponse>(
      `/v1/apps/${appId}/perfPowerMetrics`,
    );

    const metrics: PerfMetricSeries[] = [];
    for (const product of response.productData ?? []) {
      for (const category of product.metricCategories ?? []) {
        for (const metric of category.metrics ?? []) {
          const datasets: PerfMetricDataset[] = [];
          for (const dataset of metric.datasets ?? []) {
            const points = dataset.points ?? [];
            if (points.length > 0) {
              datasets.push({
                percentile: dataset.filterCriteria?.percentile ?? "unknown",
                device: dataset.filterCriteria?.device ?? "unknown",
                points: points.map((p) => ({ version: p.version, value: p.value })),
              });
            }
          }
          if (datasets.length > 0) {
            metrics.push({
              category: category.identifier,
              metric: metric.identifier,
              unit: metric.unit?.displayName ?? "",
              platform: product.platform,
              datasets,
            });
          }
        }
      }
    }

    const regressions: PerfRegression[] = (response.insights?.regressions ?? []).map((r) => ({
      metric: r.metric,
      metricCategory: r.metricCategory,
      latestVersion: r.latestVersion,
      summary: r.summaryString,
    }));

    const result = { metrics, regressions };
    cacheSet(cacheKey, result, PERF_METRICS_TTL);
    return result;
  } catch (err) {
    console.warn("[analytics] perfPowerMetrics fetch failed:", err);
    return { metrics: [], regressions: [] };
  }
}

// ---------- Aggregation ----------

function groupByDate<T>(
  rows: Array<Record<string, string>>,
  dateField: string,
  aggregate: (dateRows: Array<Record<string, string>>) => T,
): Array<T & { date: string }> {
  const groups = new Map<string, Array<Record<string, string>>>();
  for (const row of rows) {
    const date = row[dateField];
    if (!date) continue;
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(row);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dateRows]) => ({ date, ...aggregate(dateRows) }));
}

function sumField(rows: Array<Record<string, string>>, field: string): number {
  return rows.reduce((sum, r) => sum + (parseFloat(r[field]) || 0), 0);
}

function countByFieldValue(
  rows: Array<Record<string, string>>,
  field: string,
  value: string,
): number {
  return rows.filter((r) => r[field] === value).reduce(
    (sum, r) => sum + (parseInt(r["Counts"] || r["Downloads"] || "1", 10) || 1),
    0,
  );
}

function aggregateDownloads(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyDownloads"] {
  return groupByDate(rows, "Date", (dateRows) => ({
    firstTime: countByFieldValue(dateRows, "Download Type", "First-time download"),
    redownload: countByFieldValue(dateRows, "Download Type", "Redownload"),
    update:
      countByFieldValue(dateRows, "Download Type", "Auto-update") +
      countByFieldValue(dateRows, "Download Type", "Manual update"),
  }));
}

function aggregateDownloadsBySource(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyDownloadsBySource"] {
  // Only count first-time + redownload (consistent with KPI, excludes updates)
  const filterDl = (dateRows: Array<Record<string, string>>) =>
    dateRows.filter((r) => {
      const dt = r["Download Type"];
      return !dt || dt === "First-time download" || dt === "Redownload";
    });
  return groupByDate(rows, "Date", (dateRows) => {
    const filtered = filterDl(dateRows);
    return {
      search: countByFieldValue(filtered, "Source Type", "App Store search"),
      browse: countByFieldValue(filtered, "Source Type", "App Store browse"),
      webReferrer: countByFieldValue(filtered, "Source Type", "Web referrer"),
      unavailable: countByFieldValue(filtered, "Source Type", "Unavailable"),
    };
  });
}

function aggregateDailyTerritoryDownloads(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyTerritoryDownloads"] {
  const map = new Map<string, number>(); // "date|code" → count
  for (const row of rows) {
    const date = row["Date"];
    const code = row["Territory"];
    const dlType = row["Download Type"];
    if (!date || !code) continue;
    // Only count first-time downloads and redownloads (consistent with the
    // "Total downloads" KPI, which excludes updates).
    if (dlType && dlType !== "First-time download" && dlType !== "Redownload") continue;
    const key = `${date}|${code}`;
    map.set(key, (map.get(key) || 0) + (parseInt(row["Counts"] || row["Downloads"] || "1", 10) || 1));
  }
  return Array.from(map.entries()).map(([key, downloads]) => {
    const [date, code] = key.split("|");
    return { date, code, downloads };
  });
}

function aggregateTerritories(
  rows: Array<Record<string, string>>,
  purchaseRows: Array<Record<string, string>>,
): AnalyticsData["territories"] {
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

  // Download counts by territory (first-time + redownload only, consistent with KPI)
  const downloadsByTerritory = new Map<string, number>();
  for (const row of rows) {
    const code = row["Territory"];
    const dlType = row["Download Type"];
    if (!code) continue;
    if (dlType && dlType !== "First-time download" && dlType !== "Redownload") continue;
    downloadsByTerritory.set(
      code,
      (downloadsByTerritory.get(code) || 0) + (parseInt(row["Counts"] || row["Downloads"] || "1", 10) || 1),
    );
  }

  // Revenue by territory
  const revenueByTerritory = new Map<string, number>();
  for (const row of purchaseRows) {
    const code = row["Territory"];
    if (!code) continue;
    revenueByTerritory.set(
      code,
      (revenueByTerritory.get(code) || 0) + (parseFloat(row["Proceeds in USD"] || "0") || 0),
    );
  }

  const allCodes = new Set([
    ...downloadsByTerritory.keys(),
    ...revenueByTerritory.keys(),
  ]);

  return Array.from(allCodes)
    .map((code) => {
      let territory: string;
      try {
        territory = displayNames.of(code) ?? code;
      } catch {
        territory = code;
      }
      return {
        territory,
        code,
        downloads: downloadsByTerritory.get(code) || 0,
        revenue: Math.round(revenueByTerritory.get(code) || 0),
      };
    })
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, 20);
}

function aggregateDiscoverySources(
  rows: Array<Record<string, string>>,
): AnalyticsData["discoverySources"] {
  const sourceMap = new Map<string, number>();
  for (const row of rows) {
    const source = row["Source Type"];
    const dlType = row["Download Type"];
    if (!source) continue;
    // Only count first-time downloads and redownloads (consistent with KPI)
    if (dlType && dlType !== "First-time download" && dlType !== "Redownload") continue;
    sourceMap.set(
      source,
      (sourceMap.get(source) || 0) + (parseInt(row["Counts"] || row["Downloads"] || "1", 10) || 1),
    );
  }

  const sourceKeyMap: Record<string, string> = {
    "App Store search": "search",
    "App Store browse": "browse",
    "Web referrer": "webReferrer",
    "Unavailable": "unavailable",
  };

  return Array.from(sourceMap.entries())
    .map(([source, count]) => ({
      source: sourceKeyMap[source] || source,
      count,
      fill: `var(--color-${sourceKeyMap[source] || source})`,
    }))
    .sort((a, b) => b.count - a.count);
}

function aggregateRevenue(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyRevenue"] {
  return groupByDate(rows, "Date", (dateRows) => ({
    proceeds: Math.round(sumField(dateRows, "Proceeds in USD")),
    sales: Math.round(sumField(dateRows, "Sales in USD")),
  }));
}

function aggregateEngagement(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyEngagement"] {
  return groupByDate(rows, "Date", (dateRows) => {
    const listingImpressions = countByFieldValue(dateRows, "Event", "Impression");
    const pageViews = countByFieldValue(dateRows, "Event", "Page view");
    return {
      // ASC defines "Impressions" as listing views + product page views
      impressions: listingImpressions + pageViews,
      pageViews,
    };
  });
}

function aggregateSessions(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailySessions"] {
  return groupByDate(rows, "Date", (dateRows) => {
    const totalSessions = sumField(dateRows, "Sessions");
    const totalDuration = sumField(dateRows, "Total Session Duration");
    return {
      sessions: Math.round(totalSessions),
      uniqueDevices: Math.round(sumField(dateRows, "Unique Devices")),
      avgDuration: totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0,
    };
  });
}

function aggregateVersionSessions(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyVersionSessions"] {
  const groups = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const date = row["Date"];
    const version = row["App Version"];
    if (!date || !version) continue;
    if (!groups.has(date)) groups.set(date, new Map());
    const versionMap = groups.get(date)!;
    versionMap.set(
      version,
      (versionMap.get(version) || 0) + (Math.round(parseFloat(row["Sessions"] || "0")) || 0),
    );
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, versions]) => {
      const entry: Record<string, number | string> = { date };
      for (const [version, count] of versions) {
        // Convert version string to a safe key (e.g., "1.2.0" → "v1.2.0")
        entry[`v${version.replace(/\./g, "")}`] = count;
      }
      return entry;
    }) as AnalyticsData["dailyVersionSessions"];
}

function aggregateInstallsDeletes(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyInstallsDeletes"] {
  return groupByDate(rows, "Date", (dateRows) => ({
    installs: countByFieldValue(dateRows, "Event", "Install"),
    deletes: countByFieldValue(dateRows, "Event", "Delete"),
  }));
}

function aggregateOptIn(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyOptIn"] {
  return groupByDate(rows, "Date", (dateRows) => ({
    downloading: Math.round(sumField(dateRows, "Downloading Users")),
    optingIn: Math.round(sumField(dateRows, "Users Opting-In")),
  }));
}

function aggregateWebPreview(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyWebPreview"] {
  return groupByDate(rows, "Date", (dateRows) => ({
    pageViews: countByFieldValue(dateRows, "Event", "Page view"),
    appStoreTaps: countByFieldValue(dateRows, "Event", "Tap"),
  }));
}

function aggregateCrashesByVersion(
  rows: Array<Record<string, string>>,
): AnalyticsData["crashesByVersion"] {
  const groups = new Map<string, { crashes: number; uniqueDevices: number }>();
  for (const row of rows) {
    const version = row["App Version"] || "Unknown";
    const platform = row["Platform Version"] || "";
    const key = `${version}|${platform}`;
    const existing = groups.get(key) || { crashes: 0, uniqueDevices: 0 };
    existing.crashes += Math.round(parseFloat(row["Crashes"] || "0")) || 0;
    existing.uniqueDevices += Math.round(parseFloat(row["Unique Devices"] || "0")) || 0;
    groups.set(key, existing);
  }

  return Array.from(groups.entries()).map(([key, data]) => {
    const [version, platform] = key.split("|");
    return { version, platform, ...data };
  });
}

function aggregateCrashesByDevice(
  rows: Array<Record<string, string>>,
): AnalyticsData["crashesByDevice"] {
  const groups = new Map<string, { crashes: number; uniqueDevices: number }>();
  for (const row of rows) {
    const device = row["Device"] || "Unknown";
    const existing = groups.get(device) || { crashes: 0, uniqueDevices: 0 };
    existing.crashes += Math.round(parseFloat(row["Crashes"] || "0")) || 0;
    existing.uniqueDevices += Math.round(parseFloat(row["Unique Devices"] || "0")) || 0;
    groups.set(device, existing);
  }

  return Array.from(groups.entries())
    .map(([device, data]) => ({ device, ...data }))
    .sort((a, b) => b.crashes - a.crashes);
}

function aggregateDailyCrashes(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyCrashes"] {
  return groupByDate(rows, "Date", (dateRows) => ({
    crashes: Math.round(sumField(dateRows, "Crashes")),
    uniqueDevices: Math.round(sumField(dateRows, "Unique Devices")),
  }));
}

function emptyAnalyticsData(): AnalyticsData {
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

function hasAnyAnalyticsRows(data: AnalyticsData): boolean {
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

// ---------- Build phase helper ----------

async function buildPhase(
  requestIds: string[],
  appId: string,
  maxInstances: number,
): Promise<AnalyticsData> {
  const fetchReport = async (
    label: string,
    category: string,
    reportName: string,
    granularity: string,
    limit: number,
    max = limit,
  ) => {
    try {
      return await fetchReportData(appId, requestIds, category, reportName, granularity, limit, max);
    } catch (err) {
      console.error(`[analytics] ${appId}: ${label} fetch failed`, err);
      throw err;
    }
  };

  const perfPromise = fetchPerfPowerMetrics(appId);

  // Crash reports are monthly – always cap at 24 (2 years)
  const crashMax = Math.min(maxInstances, 24);

  const [
    downloadRows,
    purchaseRows,
    engagementRows,
    webPreviewRows,
    sessionRows,
    installDeleteRows,
    optInRows,
    crashRows,
    expandedCrashRows,
  ] = await Promise.all([
    fetchReport("downloads", "COMMERCE", "App Downloads Standard", "DAILY", 200, maxInstances),
    fetchReport("purchases", "COMMERCE", "App Store Purchases Standard", "DAILY", 200, maxInstances),
    fetchReport("engagement", "APP_STORE_ENGAGEMENT", "App Store Discovery and Engagement Standard", "DAILY", 200, maxInstances),
    fetchReport("web-preview", "APP_STORE_ENGAGEMENT", "App Store Web Preview Engagement Standard", "DAILY", 200, maxInstances),
    fetchReport("sessions", "APP_USAGE", "App Sessions Standard", "DAILY", 200, maxInstances),
    fetchReport("installs-deletes", "APP_USAGE", "App Store Installation and Deletion Standard", "DAILY", 200, maxInstances),
    fetchReport("opt-in", "APP_USAGE", "App Opt In", "DAILY", 200, maxInstances),
    fetchReport("crashes-monthly", "APP_USAGE", "App Crashes", "MONTHLY", 24, crashMax),
    fetchReport("crashes-expanded", "PERFORMANCE", "App Crashes Expanded", "DAILY", 200, maxInstances),
  ]);

  const perfData = await perfPromise;

  const filterByApp = (rows: Array<Record<string, string>>) => {
    if (rows.length === 0) return rows;
    if (rows[0]["App Apple Identifier"]) {
      return rows.filter((r) => r["App Apple Identifier"] === appId);
    }
    return rows;
  };

  const filteredDownloads = filterByApp(downloadRows);
  const filteredPurchases = filterByApp(purchaseRows);
  const filteredEngagement = filterByApp(engagementRows);
  const filteredWebPreview = filterByApp(webPreviewRows);
  const filteredSessions = filterByApp(sessionRows);
  const filteredInstallDeletes = filterByApp(installDeleteRows);
  const filteredOptIn = filterByApp(optInRows);
  const filteredCrashes = filterByApp(crashRows);
  const filteredExpandedCrashes = filterByApp(expandedCrashRows);

  return {
    dailyDownloads: aggregateDownloads(filteredDownloads),
    dailyRevenue: aggregateRevenue(filteredPurchases),
    dailyEngagement: aggregateEngagement(filteredEngagement),
    dailySessions: aggregateSessions(filteredSessions),
    dailyInstallsDeletes: aggregateInstallsDeletes(filteredInstallDeletes),
    dailyDownloadsBySource: aggregateDownloadsBySource(filteredDownloads),
    dailyTerritoryDownloads: aggregateDailyTerritoryDownloads(filteredDownloads),
    dailyVersionSessions: aggregateVersionSessions(filteredSessions),
    dailyOptIn: aggregateOptIn(filteredOptIn),
    dailyWebPreview: aggregateWebPreview(filteredWebPreview),
    territories: aggregateTerritories(filteredDownloads, filteredPurchases),
    discoverySources: aggregateDiscoverySources(filteredDownloads),
    crashesByVersion: aggregateCrashesByVersion(filteredCrashes),
    crashesByDevice: aggregateCrashesByDevice(filteredCrashes),
    dailyCrashes: aggregateDailyCrashes(filteredExpandedCrashes),
    perfMetrics: perfData.metrics,
    perfRegressions: perfData.regressions,
  };
}

// ---------- Background backfill ----------

const backfilling = new Set<string>();

function isBackfilled(appId: string): boolean {
  const row = db.select().from(analyticsBackfill).where(eq(analyticsBackfill.appId, appId)).get();
  return !!row;
}

function markBackfilled(appId: string): void {
  db.insert(analyticsBackfill).values({ appId }).onConflictDoNothing().run();
}

function dataPointCount(data: AnalyticsData): number {
  return data.dailyDownloads.length + data.dailySessions.length + data.dailyRevenue.length;
}

function startBackfill(requestIds: string[], appId: string, cacheKey: string) {
  if (backfilling.has(appId)) return;
  backfilling.add(appId);

  (async () => {
    const DEPTHS = [60, 120, 240, 480, Infinity];
    let prevCount = 0;
    for (const depth of DEPTHS) {
      const label = depth === Infinity ? "all" : String(depth);
      const start = Date.now();
      const data = await buildPhase(requestIds, appId, depth);
      cacheSet(cacheKey, data, ANALYTICS_TTL);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const count = dataPointCount(data);
      console.log(`[analytics] Backfill ${appId}: depth=${label}, ${count} pts, ${elapsed}s`);
      if (count <= prevCount) break;
      prevCount = count;
      if (depth === Infinity) break;
    }
    if (prevCount > 0) {
      markBackfilled(appId);
      console.log(`[analytics] Backfill complete for ${appId}: ${prevCount} total data points`);
    } else {
      console.warn(
        `[analytics] Backfill ${appId}: completed with 0 data points, leaving app unmarked so future syncs can retry`,
      );
    }
  })()
    .catch((err) => console.error(`[analytics] Backfill failed for ${appId}:`, err))
    .finally(() => backfilling.delete(appId));
}

// ---------- Main entry point ----------

const inFlight = new Map<string, Promise<AnalyticsData>>();

export function buildAnalyticsData(appId: string): Promise<AnalyticsData> {
  const cacheKey = `analytics:${appId}`;
  const cached = cacheGet<AnalyticsData>(cacheKey);
  if (cached) return Promise.resolve(cached);

  // Deduplicate concurrent builds for the same app
  const existing = inFlight.get(appId);
  if (existing) return existing;

  const promise = (async () => {
    console.log(`[analytics] Building ${appId}...`);
    return await buildAnalyticsDataInner(appId, cacheKey);
  })().finally(() => inFlight.delete(appId));

  inFlight.set(appId, promise);
  return promise;
}

async function buildAnalyticsDataInner(
  appId: string,
  cacheKey: string,
): Promise<AnalyticsData> {
  let requestIds: string[];
  try {
    console.log(`[analytics] ${appId}: loading report request IDs`);
    requestIds = await findReportRequestIds(appId);
  } catch (err) {
    console.error(`[analytics] ${appId}: failed to load report request IDs`, err);
    throw err;
  }
  if (requestIds.length === 0) {
    console.warn(`[analytics] ${appId}: no ONGOING or ONE_TIME_SNAPSHOT report requests`);
    const empty = emptyAnalyticsData();
    cacheSet(cacheKey, empty, ANALYTICS_EMPTY_RETRY_TTL);
    return empty;
  }

  // Phase 1: fetch recent 30 instances for fast initial load
  const phase1Start = Date.now();
  const data = await buildPhase(requestIds, appId, 30);
  const phase1Ms = Date.now() - phase1Start;

  const reports = [
    `downloads=${data.dailyDownloads.length}d`,
    `revenue=${data.dailyRevenue.length}d`,
    `engagement=${data.dailyEngagement.length}d`,
    `sessions=${data.dailySessions.length}d`,
    `installs=${data.dailyInstallsDeletes.length}d`,
    `optIn=${data.dailyOptIn.length}d`,
    `crashes=${data.dailyCrashes.length}d`,
  ].join(", ");
  console.log(`[analytics] ${appId}: phase 1 in ${(phase1Ms / 1000).toFixed(1)}s – ${reports}`);

  const hasRows = hasAnyAnalyticsRows(data);
  cacheSet(cacheKey, data, hasRows ? ANALYTICS_TTL : ANALYTICS_EMPTY_RETRY_TTL);
  if (!hasRows) {
    console.warn(
      `[analytics] ${appId}: phase 1 returned no rows, using short cache TTL (${ANALYTICS_EMPTY_RETRY_TTL / 60000}m) for retry`,
    );
  }

  // Phase 2: backfill all historical data (fire-and-forget).
  // Only runs once per app – the DB flag persists across restarts.
  if (!isBackfilled(appId)) {
    startBackfill(requestIds, appId, cacheKey);
  }

  return data;
}
