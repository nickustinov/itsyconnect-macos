import { DISCOVERY_SOURCES, type AnalyticsData, type DiscoverySource } from "./analytics-types";

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
    return Object.fromEntries(
      DISCOVERY_SOURCES.map(({ key, sourceType }) => [key, countByFieldValue(filtered, "Source Type", sourceType)]),
    ) as Record<DiscoverySource, number>;
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

/** Proceeds in USD per day and territory, to the cent, sorted by date then territory. */
export function aggregateDailyTerritoryRevenue(
  purchaseRows: Array<Record<string, string>>,
): AnalyticsData["dailyTerritoryRevenue"] {
  const map = new Map<string, number>(); // "date|code" -> proceeds
  for (const row of purchaseRows) {
    const date = row["Date"];
    const code = row["Territory"];
    if (!date || !code) continue;
    const key = `${date}|${code}`;
    map.set(key, (map.get(key) ?? 0) + (parseFloat(row["Proceeds in USD"]) || 0));
  }
  return Array.from(map.entries())
    .map(([key, proceeds]) => {
      const [date, code] = key.split("|");
      return { date, code, proceeds: Math.round(proceeds * 100) / 100 };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
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
        // Convert version string to a safe key (e.g., "1.2.0" -> "v1.2.0")
        entry[`v${version.replace(/\./g, "")}`] = count;
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
