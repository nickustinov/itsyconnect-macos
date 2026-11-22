import { eq } from "drizzle-orm";
import { cacheGet, cacheSet } from "@/lib/cache";
import { db } from "@/db";
import { analyticsBackfill } from "@/db/schema";
import {
  ANALYTICS_TTL,
  ANALYTICS_EMPTY_RETRY_TTL,
  GAP_PERMANENT_TTL,
  GAP_RETRY_TTL,
  emptyAnalyticsData,
  hasAnyAnalyticsRows,
  mergeAnalyticsData,
  normaliseAnalyticsData,
  downloadGapSignature,
  type AnalyticsData,
} from "./analytics-types";
import {
  aggregateDownloads,
  aggregateDownloadsBySource,
  aggregateDailyTerritoryDownloads,
  aggregateDailyTerritoryRevenue,
  aggregateRevenue,
  aggregateEngagement,
  aggregateSessions,
  aggregateVersionSessions,
  aggregateInstallsDeletes,
  aggregateOptIn,
  aggregateWebPreview,
  aggregateCrashesByVersion,
  aggregateCrashesByDevice,
  aggregateDailyCrashes,
} from "./analytics-aggregation";
import {
  findReportRequestIds,
  fetchReportData,
  fetchPerfPowerMetrics,
  reportRequestIdsInvalidated,
  resetInstanceFailures,
  instanceFailureCount,
} from "./analytics-reports";

// ---------- Re-exports ----------

export type {
  PerfMetricPoint,
  PerfMetricDataset,
  PerfMetricSeries,
  PerfRegression,
  AnalyticsData,
} from "./analytics-types";

export { parseTsv } from "./analytics-types";
export { fetchPerfPowerMetrics } from "./analytics-reports";

/**
 * The accumulated analytics in the cache, in the current shape. The cache row is
 * the long-lived store, so this reads past its TTL.
 */
function readAccumulated(cacheKey: string): AnalyticsData | null {
  const cached = cacheGet<AnalyticsData>(cacheKey, true);
  return cached ? normaliseAnalyticsData(cached) : null;
}

/** An app's accumulated analytics, or null before its first build. */
export function getCachedAnalytics(appId: string): AnalyticsData | null {
  return readAccumulated(`analytics:${appId}`);
}

/**
 * Merge freshly fetched analytics into the durably cached (accumulated) data so
 * we never erase history Apple stops returning, then persist. Reads ignore
 * staleness so accumulation survives restarts.
 */
function accumulateAndCache(cacheKey: string, fresh: AnalyticsData, ttlMs: number): AnalyticsData {
  const existing = readAccumulated(cacheKey);
  const merged = existing ? mergeAnalyticsData(existing, fresh) : fresh;
  cacheSet(cacheKey, merged, ttlMs);
  return merged;
}

/**
 * Returns the timestamp (ms) when we created report requests for this app,
 * or null if reports were already set up before Itsyconnect.
 */
export function getReportInitiatedAt(appId: string): number | null {
  return cacheGet<number>(`report-initiated:${appId}`, true);
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

  // Crash reports are monthly -- always cap at 24 (2 years)
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
    dailyTerritoryRevenue: aggregateDailyTerritoryRevenue(filteredPurchases),
    dailyVersionSessions: aggregateVersionSessions(filteredSessions),
    dailyOptIn: aggregateOptIn(filteredOptIn),
    dailyWebPreview: aggregateWebPreview(filteredWebPreview),
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

/**
 * Decide whether to (re)run the deep backfill. Runs on first sight, or whenever
 * the accumulated data has a significant gap we haven't already tried to fill –
 * so gaps from app downtime self-heal once Apple still has the data, without any
 * manual intervention. The signature dedupes gaps Apple genuinely doesn't have.
 */
function shouldBackfill(appId: string, data: AnalyticsData): boolean {
  if (!isBackfilled(appId)) return true;
  const gapSig = downloadGapSignature(data);
  if (gapSig === "") return false;
  // Respect the signature's TTL: a gap from a failed fetch is stored with a short
  // TTL, so it expires and we retry; a permanent gap is stored long, so we don't.
  const lastAttempted = cacheGet<string>(`analytics-gapsig:${appId}`);
  return gapSig !== lastAttempted;
}

function dataPointCount(data: AnalyticsData): number {
  return data.dailyDownloads.length + data.dailySessions.length + data.dailyRevenue.length;
}

function startBackfill(requestIds: string[], appId: string, cacheKey: string) {
  /* v8 ignore next -- @preserve */
  if (backfilling.has(appId)) return;
  backfilling.add(appId);

  (async () => {
    resetInstanceFailures(appId);
    const DEPTHS = [60, 120, 240, 480, Infinity];
    let prevCount = 0;
    for (const depth of DEPTHS) {
      /* v8 ignore next -- @preserve */
      const label = depth === Infinity ? "all" : String(depth);
      const start = Date.now();
      const data = await buildPhase(requestIds, appId, depth);
      const merged = accumulateAndCache(cacheKey, data, ANALYTICS_TTL);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const count = dataPointCount(merged);
      console.log(`[analytics] Backfill ${appId}: depth=${label}, ${count} pts, ${elapsed}s`);
      if (count <= prevCount) break;
      prevCount = count;
      /* v8 ignore next -- @preserve */
      if (depth === Infinity) break;
    }
    if (prevCount > 0) {
      markBackfilled(appId);
      // Record the gaps that remain after our best effort. If instances failed to
      // download (Apple 500s), use a short TTL so we retry soon (Apple may
      // recover); otherwise the gap is genuinely absent from ASC – record it long
      // so we don't keep re-fetching an unfillable window.
      const finalData = readAccumulated(cacheKey);
      if (finalData) {
        const failures = instanceFailureCount(appId);
        const ttl = failures > 0 ? GAP_RETRY_TTL : GAP_PERMANENT_TTL;
        cacheSet(`analytics-gapsig:${appId}`, downloadGapSignature(finalData), ttl);
        if (failures > 0) {
          console.warn(`[analytics] Backfill ${appId}: ${failures} instance(s) failed to download – will retry to fill gaps`);
        }
      }
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

export function buildAnalyticsData(
  appId: string,
  opts?: { force?: boolean },
): Promise<AnalyticsData> {
  const cacheKey = `analytics:${appId}`;
  if (!opts?.force) {
    const cached = cacheGet<AnalyticsData>(cacheKey);
    if (cached) return Promise.resolve(normaliseAnalyticsData(cached));
  }

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
    // Don't erase accumulated history on a transient empty result – keep what we have.
    const existing = readAccumulated(cacheKey);
    if (existing && hasAnyAnalyticsRows(existing)) {
      cacheSet(cacheKey, existing, ANALYTICS_EMPTY_RETRY_TTL);
      return existing;
    }
    const empty = emptyAnalyticsData();
    cacheSet(cacheKey, empty, ANALYTICS_EMPTY_RETRY_TTL);
    return empty;
  }

  // Phase 1: fetch recent 30 instances for fast initial load
  const phase1Start = Date.now();
  let data = await buildPhase(requestIds, appId, 30);

  // If a stale report request was detected and invalidated during the build,
  // re-resolve IDs and retry so the user doesn't have to restart.
  if (reportRequestIdsInvalidated(appId)) {
    console.log(`[analytics] ${appId}: stale request IDs detected, re-resolving and retrying`);
    requestIds = await findReportRequestIds(appId);
    if (requestIds.length > 0) {
      data = await buildPhase(requestIds, appId, 30);
    }
  }

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

  // Accumulate into the durable cache so a shallow refresh never erases history.
  const existing = readAccumulated(cacheKey);
  data = existing ? mergeAnalyticsData(existing, data) : data;

  const hasRows = hasAnyAnalyticsRows(data);
  cacheSet(cacheKey, data, hasRows ? ANALYTICS_TTL : ANALYTICS_EMPTY_RETRY_TTL);
  if (hasRows) {
    // Data arrived -- clear the "report initiated" flag so the banner disappears.
    cacheSet(`report-initiated:${appId}`, null, 0);
  }
  if (!hasRows) {
    console.warn(
      `[analytics] ${appId}: phase 1 returned no rows, using short cache TTL (${ANALYTICS_EMPTY_RETRY_TTL / 60000}m) for retry`,
    );
  }

  // Phase 2: backfill historical data (fire-and-forget). Runs on first sight and
  // again whenever a new gap appears (e.g. after app downtime), so missing
  // windows self-heal once Apple still has the data – no manual reset needed.
  if (shouldBackfill(appId, data)) {
    startBackfill(requestIds, appId, cacheKey);
  }

  return data;
}
