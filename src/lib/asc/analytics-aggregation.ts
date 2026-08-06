import type { AnalyticsData } from "./analytics-types";
import { encodeVersionSessionKey } from "@/lib/format";

// ---------- Generic helpers ----------

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

// ---------- Aggregation functions ----------

export function aggregateDownloads(
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

export function aggregateDownloadsBySource(
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

export function aggregateDailyTerritoryDownloads(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyTerritoryDownloads"] {
  const map = new Map<string, number>(); // "date|code" -> count
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

export function aggregateTerritories(
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

export function aggregateDiscoverySources(
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

export function aggregateRevenue(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyRevenue"] {
  return groupByDate(rows, "Date", (dateRows) => ({
    proceeds: Math.round(sumField(dateRows, "Proceeds in USD")),
    sales: Math.round(sumField(dateRows, "Sales in USD")),
  }));
}

export function aggregateEngagement(
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

export function aggregateSessions(
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

export function aggregateVersionSessions(
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
        entry[encodeVersionSessionKey(version)] = count;
      }
      return entry;
    }) as AnalyticsData["dailyVersionSessions"];
}

export function aggregateInstallsDeletes(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyInstallsDeletes"] {
  return groupByDate(rows, "Date", (dateRows) => ({
    installs: countByFieldValue(dateRows, "Event", "Install"),
    deletes: countByFieldValue(dateRows, "Event", "Delete"),
  }));
}

export function aggregateOptIn(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyOptIn"] {
  return groupByDate(rows, "Date", (dateRows) => ({
    downloading: Math.round(sumField(dateRows, "Downloading Users")),
    optingIn: Math.round(sumField(dateRows, "Users Opting-In")),
  }));
}

export function aggregateWebPreview(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyWebPreview"] {
  return groupByDate(rows, "Date", (dateRows) => ({
    pageViews: countByFieldValue(dateRows, "Event", "Page view"),
    appStoreTaps: countByFieldValue(dateRows, "Event", "Tap"),
  }));
}

export function aggregateCrashesByVersion(
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

export function aggregateCrashesByDevice(
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

export function aggregateDailyCrashes(
  rows: Array<Record<string, string>>,
): AnalyticsData["dailyCrashes"] {
  return groupByDate(rows, "Date", (dateRows) => ({
    crashes: Math.round(sumField(dateRows, "Crashes")),
    uniqueDevices: Math.round(sumField(dateRows, "Unique Devices")),
  }));
}
