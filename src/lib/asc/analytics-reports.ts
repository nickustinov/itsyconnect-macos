import { gunzipSync } from "node:zlib";
import { ascFetch, AscApiError } from "./client";
import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/cache";
import {
  REPORT_ID_TTL,
  INSTANCE_TTL,
  TODAY_TTL,
  PERF_METRICS_TTL,
  findDateGaps,
  parseTsv,
  pushAll,
  type AscReportRequest,
  type AscReport,
  type AscReportInstance,
  type AscReportSegment,
  type AscListResponse,
  type PerfPowerMetricsResponse,
  type PerfMetricSeries,
  type PerfMetricDataset,
  type PerfRegression,
} from "./analytics-types";

// ---------- Report request discovery ----------

// In-memory caches -- these never change for the lifetime of the process
const reportRequestIdsCache = new Map<string, string[]>();
const reportIdCache = new Map<string, string>();

function normalizeReportName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Clear a cached report ID from both in-memory and SQLite caches. */
function invalidateReportId(requestId: string, reportName: string): void {
  const key = `${requestId}:${reportName}`;
  reportIdCache.delete(key);
  cacheInvalidate(`asc-report-id:${key}`);
}

/** Clear cached report request IDs so the next call re-discovers from API and runs health checks. */
export function invalidateReportRequestIds(appId: string): void {
  reportRequestIdsCache.delete(appId);
  cacheInvalidate(`asc-report-requests:${appId}`);
}

/** Check if report request IDs were invalidated (cache is empty). */
export function reportRequestIdsInvalidated(appId: string): boolean {
  return !reportRequestIdsCache.has(appId);
}

// Count instance-segment downloads that failed (e.g. Apple returns 500 for a
// specific instance). A gap caused by these is recoverable once Apple's server
// resolves, so callers retry sooner instead of recording it as a permanent gap.
const instanceFailures = new Map<string, number>();

export function resetInstanceFailures(appId: string): void {
  instanceFailures.set(appId, 0);
}

export function instanceFailureCount(appId: string): number {
  return instanceFailures.get(appId) ?? 0;
}

function recordInstanceFailure(appId: string): void {
  instanceFailures.set(appId, (instanceFailures.get(appId) ?? 0) + 1);
}

/** Probe whether a report request has any downloadable instances. */
async function snapshotHasInstances(appId: string, requestId: string): Promise<boolean> {
  try {
    const reports = await ascFetch<AscListResponse<AscReport>>(
      `/v1/analyticsReportRequests/${requestId}/reports?filter[category]=COMMERCE`,
    );
    const probe = reports.data.find((r) =>
      normalizeReportName(r.attributes.name).includes("download"),
    );
    if (!probe) return false;
    const instances = await ascFetch<AscListResponse<AscReportInstance>>(
      `/v1/analyticsReports/${probe.id}/instances?filter[granularity]=DAILY&limit=1`,
    );
    return instances.data.length > 0;
  } catch {
    // If the probe fails, assume valid to avoid deleting a working request
    console.warn(`[analytics] ${appId}: snapshot probe failed for ${requestId}, assuming valid`);
    return true;
  }
}

export async function findReportRequestIds(appId: string): Promise<string[]> {
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
  // Their instances can overlap on data dates -- fetchReportData
  // deduplicates rows by data date to prevent double-counting.
  const ids = response.data
    .filter((r) => r.attributes.accessType === "ONGOING" || r.attributes.accessType === "ONE_TIME_SNAPSHOT")
    .map((r) => r.id);

  /* v8 ignore start -- @preserve */
  const requestSummary = response.data.map((r) => {
    const attrs = r.attributes ?? {};
    const accessType = String(attrs.accessType ?? "UNKNOWN");
    const state = typeof attrs.state === "string" ? `, state=${attrs.state}` : "";
    const createdDate = typeof attrs.createdDate === "string" ? `, created=${attrs.createdDate}` : "";
    return `${r.id}(${accessType}${state}${createdDate})`;
  }).join("; ");
  /* v8 ignore stop -- @preserve */
  console.log(`[analytics] ${appId}: ${ids.length} usable report requests from ${response.data.length} total`);
  if (requestSummary) {
    console.log(`[analytics] ${appId}: report request details: ${requestSummary}`);
  }
  if (response.data.length > 0 && ids.length === 0) {
    console.warn(`[analytics] ${appId}: report requests exist but none are ONGOING/ONE_TIME_SNAPSHOT`);
  }

  // Check if the snapshot is stale (exists but has 0 downloadable instances).
  // Apple expires instances server-side, leaving a dead request that blocks
  // creation of a fresh one. Delete it so the create loop below picks it up.
  const snapshotReq = response.data.find(
    (r) => ids.includes(r.id) && r.attributes.accessType === "ONE_TIME_SNAPSHOT",
  );
  if (snapshotReq) {
    const hasData = await snapshotHasInstances(appId, snapshotReq.id);
    if (!hasData) {
      console.log(`[analytics] ${appId}: ONE_TIME_SNAPSHOT ${snapshotReq.id} is empty, deleting to request a fresh one`);
      try {
        await ascFetch(`/v1/analyticsReportRequests/${snapshotReq.id}`, { method: "DELETE" });
        ids.splice(ids.indexOf(snapshotReq.id), 1);
      } catch (err) {
        console.warn(`[analytics] ${appId}: failed to delete stale snapshot`, err);
      }
    }
  }

  // Create any missing report request types. ASC requires a POST before
  // analytics data becomes available. ONGOING provides daily data going
  // forward; ONE_TIME_SNAPSHOT provides historical backfill (takes hours).
  const existingTypes = new Set(
    response.data
      .filter((r) => ids.includes(r.id))
      .map((r) => r.attributes.accessType),
  );
  for (const accessType of ["ONGOING", "ONE_TIME_SNAPSHOT"] as const) {
    if (existingTypes.has(accessType)) continue;
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
      // Track when we initiated reports so the UI can show
      // an appropriate banner while Apple generates data (24-48h).
      cacheSet(`report-initiated:${appId}`, Date.now(), 48 * 60 * 60 * 1000);
    } catch (err) {
      console.warn(`[analytics] ${appId}: failed to create ${accessType} report request`, err);
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
  let reportsResp: AscListResponse<AscReport>;
  try {
    reportsResp = await ascFetch<AscListResponse<AscReport>>(
      `/v1/analyticsReportRequests/${requestId}/reports?filter[category]=${category}`,
    );
  } catch (err) {
    if (err instanceof AscApiError && err.ascError.statusCode === 404) {
      console.warn(`[analytics] ${appId}: report request ${requestId} returned 404, invalidating request IDs`);
      invalidateReportRequestIds(appId);
      return null;
    }
    throw err;
  }

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
  // Pre-signed S3 URL -- no auth header, retry on transient network errors
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
    // pushAll, not push(...): snapshot instances can hold 300k+ rows, which
    // exceeds the engine's argument-count limit when spread into push().
    pushAll(rows, parseTsv(tsv));
  }
  return rows;
}

// ---------- Report fetching ----------

export async function fetchReportData(
  appId: string,
  requestIds: string[],
  category: string,
  reportName: string,
  granularity: string,
  limit: number,
  maxInstances = limit,
): Promise<Array<Record<string, string>>> {
  const today = new Date().toISOString().slice(0, 10);

  // Collect instances, deduplicating by instance id (NOT processingDate): a
  // ONE_TIME_SNAPSHOT request can have an instance with the same processingDate
  // as the ONGOING request but containing far more history. Deduping by date
  // would discard the richer snapshot instance before we ever download it; the
  // per-data-date dedup below merges them correctly.
  const seenInstanceIds = new Set<string>();
  const uniqueInstances: AscReportInstance[] = [];
  let matchedRequests = 0;

  for (const requestId of requestIds) {
    let reportId = await findReportId(appId, requestId, category, reportName);
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
      let resp: AscListResponse<AscReportInstance>;
      try {
        resp = await ascFetch<AscListResponse<AscReportInstance>>(url);
      } catch (err) {
        if (err instanceof AscApiError && err.ascError.statusCode === 404) {
          console.warn(`[analytics] ${appId}: report ${reportId} returned 404, invalidating cache and retrying`);
          invalidateReportId(requestId, reportName);
          reportId = await findReportId(appId, requestId, category, reportName);
          if (!reportId) {
            invalidateReportRequestIds(appId);
            break;
          }
          url = `/v1/analyticsReports/${reportId}/instances?filter[granularity]=${granularity}&limit=${Math.min(limit, 200)}`;
          try {
            resp = await ascFetch<AscListResponse<AscReportInstance>>(url);
          } catch (retryErr) {
            if (retryErr instanceof AscApiError && retryErr.ascError.statusCode === 404) {
              console.warn(`[analytics] ${appId}: report ${reportId} still 404 after re-resolve, invalidating request IDs`);
              invalidateReportRequestIds(appId);
              break;
            }
            throw retryErr;
          }
        } else {
          throw err;
        }
      }

      for (const inst of resp.data) {
        if (!seenInstanceIds.has(inst.id)) {
          seenInstanceIds.add(inst.id);
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
  // contains data for Feb 21-22, while Feb 24's has Feb 22-23).
  // Deduplicate by keeping only the first occurrence of each data date.
  // Instances are ordered newest-first from the API, so the most recent
  // (freshest) data wins for any overlapping date.
  const seenDataDates = new Set<string>();
  const deduped: Array<Record<string, string>> = [];

  for (const result of instanceResults) {
    if (result.status !== "fulfilled") {
      console.warn(`[analytics] ${appId}: instance download failed (data may be incomplete):`, result.reason);
      recordInstanceFailure(appId);
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
        // Same argument-count limit as above – a single date can hold enough
        // rows to exceed it once territory/source/version dimensions multiply.
        pushAll(deduped, rows);
      }
    }
  }

  // Coverage summary: the date range ASC actually returned, and any holes in it.
  const coveredDates = [...seenDataDates].sort();
  const gaps = findDateGaps(coveredDates);
  console.log(
    `[analytics] ${appId}: ${category}/${reportName} coverage: ${coveredDates.length} dates ` +
      `${coveredDates[0] ?? "-"}..${coveredDates[coveredDates.length - 1] ?? "-"}` +
      (gaps.length > 0 ? ` GAPS: ${gaps.map((g) => `${g.from}→${g.to}(${g.missingDays}d)`).join(", ")}` : " (no gaps)") +
      ` (${deduped.length} rows across ${uniqueInstances.length} instances)`,
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
