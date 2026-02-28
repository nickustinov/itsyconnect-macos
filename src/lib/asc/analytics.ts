import { gunzipSync } from "node:zlib";
import { ascFetch } from "./client";
import { cacheGet, cacheSet } from "@/lib/cache";
import type { AnalyticsData } from "@/lib/mock-analytics";

const ANALYTICS_TTL = 60 * 60 * 1000; // 1 hour (sync worker refreshes hourly)
const REPORT_ID_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days (report request/report IDs never change)
const INSTANCE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days (immutable past data)
const TODAY_TTL = 10 * 60 * 1000; // 10 min (today's data may update)

// ---------- Types ----------

interface AscReportRequest {
  id: string;
  attributes: { accessType: string };
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

async function findReportRequestIds(appId: string): Promise<string[]> {
  // Tier 1: in-memory
  const memCached = reportRequestIdsCache.get(appId);
  if (memCached) return memCached;

  // Tier 2: SQLite
  const dbKey = `asc-report-requests:${appId}`;
  const dbCached = cacheGet<string[]>(dbKey);
  if (dbCached) {
    reportRequestIdsCache.set(appId, dbCached);
    return dbCached;
  }

  // Tier 3: API
  const response = await ascFetch<AscListResponse<AscReportRequest>>(
    `/v1/apps/${appId}/analyticsReportRequests`,
  );

  // Collect both ONGOING and ONE_TIME_SNAPSHOT request IDs.
  // ONGOING has recent daily data; SNAPSHOT has historical backfill.
  const ids = response.data
    .filter((r) => r.attributes.accessType === "ONGOING" || r.attributes.accessType === "ONE_TIME_SNAPSHOT")
    .map((r) => r.id);

  console.log(`[analytics] Found ${response.data.length} report requests for app ${appId}:`,
    response.data.map((r) => `${r.id} (${r.attributes.accessType})`));

  reportRequestIdsCache.set(appId, ids);
  cacheSet(dbKey, ids, REPORT_ID_TTL);
  return ids;
}

async function findReportId(
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

  // Cache all reports from this category for this request
  for (const r of reportsResp.data) {
    const rKey = `${requestId}:${r.attributes.name}`;
    reportIdCache.set(rKey, r.id);
    cacheSet(`asc-report-id:${rKey}`, r.id, REPORT_ID_TTL);
  }

  return reportIdCache.get(key) ?? null;
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
  requestIds: string[],
  category: string,
  reportName: string,
  granularity: string,
  limit: number,
  maxInstances = limit,
): Promise<Array<Record<string, string>>> {
  const today = new Date().toISOString().slice(0, 10);

  // Collect instances from ALL report requests (ONGOING + SNAPSHOT),
  // deduplicate by processingDate (prefer the first seen).
  const seenDates = new Set<string>();
  const uniqueInstances: AscReportInstance[] = [];

  for (const requestId of requestIds) {
    const reportId = await findReportId(requestId, category, reportName);
    if (!reportId) continue;

    // Paginate through all instances up to maxInstances
    let url: string | undefined =
      `/v1/analyticsReports/${reportId}/instances?filter[granularity]=${granularity}&limit=${Math.min(limit, 200)}`;
    let pageCount = 0;

    while (url && uniqueInstances.length < maxInstances) {
      const resp: AscListResponse<AscReportInstance> =
        await ascFetch<AscListResponse<AscReportInstance>>(url);
      pageCount++;

      for (const inst of resp.data) {
        const date = inst.attributes.processingDate;
        if (!seenDates.has(date)) {
          seenDates.add(date);
          uniqueInstances.push(inst);
        }
      }

      url = resp.links?.next;
    }

    console.log(`[analytics] ${reportName} from request ${requestId}: ${pageCount} page(s)`);
  }

  console.log(`[analytics] ${reportName}: ${uniqueInstances.length} unique instances across ${requestIds.length} requests`);

  if (uniqueInstances.length === 0) return [];

  // For each instance: use per-instance cache (past days are immutable),
  // only download if missing or today (today's data may still update).
  // All instances are launched concurrently but the global download
  // semaphore (MAX_CONCURRENT_DOWNLOADS) limits actual S3 requests.
  const results = await Promise.allSettled(
    uniqueInstances.map(async (instance) => {
      const instanceKey = `analytics-inst:${instance.id}`;
      const isToday = instance.attributes.processingDate === today;

      if (!isToday) {
        const cached = cacheGet<Array<Record<string, string>>>(instanceKey);
        if (cached) return cached;
      }

      const rows = await downloadInstanceRows(instance.id);
      cacheSet(instanceKey, rows, isToday ? TODAY_TTL : INSTANCE_TTL);
      return rows;
    }),
  );

  const allRows: Array<Record<string, string>> = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allRows.push(...result.value);
    } else {
      console.warn(`[analytics] Instance download failed:`, result.reason);
    }
  }

  return allRows;
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
  return groupByDate(rows, "Date", (dateRows) => ({
    search: countByFieldValue(dateRows, "Source Type", "App Store search"),
    browse: countByFieldValue(dateRows, "Source Type", "App Store browse"),
    webReferrer: countByFieldValue(dateRows, "Source Type", "Web referrer"),
    unavailable: countByFieldValue(dateRows, "Source Type", "Unavailable"),
  }));
}

function aggregateTerritories(
  rows: Array<Record<string, string>>,
  purchaseRows: Array<Record<string, string>>,
): AnalyticsData["territories"] {
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

  // Download counts by territory
  const downloadsByTerritory = new Map<string, number>();
  for (const row of rows) {
    const code = row["Territory"];
    if (!code) continue;
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
    if (!source) continue;
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
  return groupByDate(rows, "Date", (dateRows) => ({
    impressions: countByFieldValue(dateRows, "Event", "Impression"),
    pageViews: countByFieldValue(dateRows, "Event", "Page view"),
  }));
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
    const key = `${row["App Version"]}|${row["Platform Version"]}`;
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

function emptyAnalyticsData(): AnalyticsData {
  return {
    dailyDownloads: [],
    dailyRevenue: [],
    dailyEngagement: [],
    dailySessions: [],
    dailyInstallsDeletes: [],
    dailyDownloadsBySource: [],
    dailyVersionSessions: [],
    dailyOptIn: [],
    dailyWebPreview: [],
    territories: [],
    discoverySources: [],
    crashesByVersion: [],
    crashesByDevice: [],
  };
}

// ---------- Main entry point ----------

export async function buildAnalyticsData(appId: string): Promise<AnalyticsData> {
  const cacheKey = `analytics:${appId}`;
  const cached = cacheGet<AnalyticsData>(cacheKey);
  if (cached) return cached;

  console.log(`[analytics] Fetching ${appId}...`);
  const start = Date.now();
  const data = await buildAnalyticsDataInner(appId, cacheKey);
  console.log(`[analytics] Done ${appId} in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  return data;
}

async function buildAnalyticsDataInner(
  appId: string,
  cacheKey: string,
): Promise<AnalyticsData> {

  const requestIds = await findReportRequestIds(appId);
  if (requestIds.length === 0) {
    // No analytics report requests exist – return empty data.
    // User needs to enable analytics reports in App Store Connect.
    const empty = emptyAnalyticsData();
    cacheSet(cacheKey, empty, ANALYTICS_TTL);
    return empty;
  }

  // Fetch all report types in parallel.
  // Each fetchReportData call queries ALL request IDs (ONGOING + SNAPSHOT)
  // and deduplicates instances by date. Per-instance caching ensures
  // only new/today's data is downloaded on refresh.
  const [
    downloadRows,
    purchaseRows,
    engagementRows,
    webPreviewRows,
    sessionRows,
    installDeleteRows,
    optInRows,
    crashRows,
  ] = await Promise.all([
    fetchReportData(requestIds, "COMMERCE", "App Downloads Standard", "DAILY", 200, 365),
    fetchReportData(requestIds, "COMMERCE", "App Store Purchases Standard", "DAILY", 200, 365),
    fetchReportData(requestIds, "APP_STORE_ENGAGEMENT", "App Store Discovery and Engagement Standard", "DAILY", 200, 365),
    fetchReportData(requestIds, "APP_STORE_ENGAGEMENT", "App Store Web Preview Engagement Standard", "DAILY", 200, 365),
    fetchReportData(requestIds, "APP_USAGE", "App Sessions Standard", "DAILY", 200, 365),
    fetchReportData(requestIds, "APP_USAGE", "App Store Installation and Deletion Standard", "DAILY", 200, 365),
    fetchReportData(requestIds, "APP_USAGE", "App Opt In", "DAILY", 200, 365),
    fetchReportData(requestIds, "APP_USAGE", "App Crashes", "MONTHLY", 24, 24),
  ]);

  // Filter rows by app's Apple ID (numeric) if present
  const filterByApp = (rows: Array<Record<string, string>>) => {
    if (rows.length === 0) return rows;
    // If rows have "App Apple Identifier", filter by appId
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

  const data: AnalyticsData = {
    dailyDownloads: aggregateDownloads(filteredDownloads),
    dailyRevenue: aggregateRevenue(filteredPurchases),
    dailyEngagement: aggregateEngagement(filteredEngagement),
    dailySessions: aggregateSessions(filteredSessions),
    dailyInstallsDeletes: aggregateInstallsDeletes(filteredInstallDeletes),
    dailyDownloadsBySource: aggregateDownloadsBySource(filteredDownloads),
    dailyVersionSessions: aggregateVersionSessions(filteredSessions),
    dailyOptIn: aggregateOptIn(filteredOptIn),
    dailyWebPreview: aggregateWebPreview(filteredWebPreview),
    territories: aggregateTerritories(filteredDownloads, filteredPurchases),
    discoverySources: aggregateDiscoverySources(filteredDownloads),
    crashesByVersion: aggregateCrashesByVersion(filteredCrashes),
    crashesByDevice: aggregateCrashesByDevice(filteredCrashes),
  };

  cacheSet(cacheKey, data, ANALYTICS_TTL);
  return data;
}
