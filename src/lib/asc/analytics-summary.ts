import {
  DISCOVERY_SOURCES,
  type AnalyticsData,
  type DiscoverySource,
} from "./analytics-types";

// Totals over a range of daily analytics rows. Callers filter the rows to the
// range first, so these always match the period they're shown for.

/** Apple's name for a discovery source, e.g. "App referrer". */
export function discoverySourceName(source: DiscoverySource): string {
  return DISCOVERY_SOURCES.find((s) => s.key === source)!.sourceType;
}

/** Downloads per discovery source, most first. Sources with none are left out. */
export function sumDiscoverySources(
  rows: AnalyticsData["dailyDownloadsBySource"],
): Array<{ source: DiscoverySource; count: number }> {
  return DISCOVERY_SOURCES
    .map(({ key }) => ({ source: key, count: rows.reduce((sum, row) => sum + row[key], 0) }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
}

function territoryName(displayNames: Intl.DisplayNames, code: string): string {
  try {
    return displayNames.of(code) ?? code;
  } catch {
    // Not a region code Intl accepts
    return code;
  }
}

/** Downloads and proceeds (USD, to the cent) per territory, most downloads first. */
export function sumTerritories(
  downloads: AnalyticsData["dailyTerritoryDownloads"],
  revenue: AnalyticsData["dailyTerritoryRevenue"],
): Array<{ territory: string; code: string; downloads: number; revenue: number }> {
  const downloadsByCode = new Map<string, number>();
  for (const row of downloads) {
    downloadsByCode.set(row.code, (downloadsByCode.get(row.code) ?? 0) + row.downloads);
  }
  const revenueByCode = new Map<string, number>();
  for (const row of revenue) {
    revenueByCode.set(row.code, (revenueByCode.get(row.code) ?? 0) + row.proceeds);
  }

  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  return [...new Set([...downloadsByCode.keys(), ...revenueByCode.keys()])]
    .map((code) => ({
      territory: territoryName(displayNames, code),
      code,
      downloads: downloadsByCode.get(code) ?? 0,
      revenue: Math.round((revenueByCode.get(code) ?? 0) * 100) / 100,
    }))
    .sort((a, b) => b.downloads - a.downloads);
}
