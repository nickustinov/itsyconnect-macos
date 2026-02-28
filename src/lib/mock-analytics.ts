/**
 * Mock analytics data modeled after real ASC Analytics API reports.
 * 30 days: Jan 27 – Feb 25, 2026.
 */

const START = new Date(2026, 0, 27);
const DAY_COUNT = 30;

export const ANALYTICS_DAYS = Array.from({ length: DAY_COUNT }, (_, i) => {
  const d = new Date(START);
  d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 10);
});

/** Deterministic noise in [-1, 1] */
export function n(i: number, seed: number): number {
  const x = Math.sin(i * 9.1 + seed * 7.3) * 10000;
  return (x - Math.floor(x)) * 2 - 1;
}

export function series(
  base: number,
  variance: number,
  seed: number,
  trend = 0,
): number[] {
  return ANALYTICS_DAYS.map((_, i) =>
    Math.max(0, Math.round(base + trend * i + n(i, seed) * variance)),
  );
}

// ---------- Downloads by type ----------

const firstTime = series(55, 20, 1, 0.8);
const redownload = series(25, 10, 2);
const update = series(120, 40, 3, 0.5);

export const DAILY_DOWNLOADS = ANALYTICS_DAYS.map((date, i) => ({
  date,
  firstTime: firstTime[i],
  redownload: redownload[i],
  update: update[i],
}));

// ---------- Revenue ----------

const proceeds = series(150, 50, 4, 1.2);

export const DAILY_REVENUE = ANALYTICS_DAYS.map((date, i) => ({
  date,
  proceeds: proceeds[i],
  sales: Math.round(proceeds[i] * 1.18),
}));

// ---------- Engagement (impressions + page views) ----------

const impressions = series(3000, 800, 5, 15);
const pageViews = series(500, 120, 6, 5);

export const DAILY_ENGAGEMENT = ANALYTICS_DAYS.map((date, i) => ({
  date,
  impressions: impressions[i],
  pageViews: pageViews[i],
}));

// ---------- Sessions ----------

const sessions = series(400, 100, 7, 3);
const uniqueDevices = series(250, 60, 8, 2);
const avgDuration = series(45, 15, 9);

export const DAILY_SESSIONS = ANALYTICS_DAYS.map((date, i) => ({
  date,
  sessions: sessions[i],
  uniqueDevices: uniqueDevices[i],
  avgDuration: avgDuration[i],
}));

// ---------- Installs vs deletes ----------

const deletes = series(15, 8, 10);

export const DAILY_INSTALLS_DELETES = ANALYTICS_DAYS.map((date, i) => ({
  date,
  installs: firstTime[i] + redownload[i],
  deletes: deletes[i],
}));

// ---------- Downloads by source ----------

const search = series(35, 12, 11, 0.4);
const browse = series(18, 8, 12);
const webRef = series(10, 5, 13, 0.3);

export const DAILY_DOWNLOADS_BY_SOURCE = ANALYTICS_DAYS.map((date, i) => ({
  date,
  search: search[i],
  browse: browse[i],
  webReferrer: webRef[i],
  unavailable: Math.max(0, firstTime[i] - search[i] - browse[i] - webRef[i]),
}));

// ---------- Version sessions ----------

export const DAILY_VERSION_SESSIONS = ANALYTICS_DAYS.map((date, i) => {
  const v11 = Math.max(0, Math.round(80 - i * 3 + n(i, 14) * 15));
  const v12 = Math.max(
    0,
    Math.round(120 - Math.max(0, i - 10) * 4 + n(i, 15) * 20),
  );
  const v13 = Math.max(
    0,
    Math.round(Math.min(i * 6, 150) + n(i, 16) * 20),
  );
  const v20 =
    i >= 20
      ? Math.max(0, Math.round((i - 20) * 12 + n(i, 17) * 15))
      : 0;
  return { date, v11, v12, v13, v20 };
});

// ---------- Opt-in ----------

const downloading = series(100, 30, 18, 0.5);
const optingIn = downloading.map((d, i) =>
  Math.round(d * (0.22 + n(i, 19) * 0.05)),
);

export const DAILY_OPT_IN = ANALYTICS_DAYS.map((date, i) => ({
  date,
  downloading: downloading[i],
  optingIn: optingIn[i],
}));

// ---------- Web preview ----------

const webPV = series(40, 15, 20);
const webTaps = series(12, 6, 21);

export const DAILY_WEB_PREVIEW = ANALYTICS_DAYS.map((date, i) => ({
  date,
  pageViews: webPV[i],
  appStoreTaps: webTaps[i],
}));

// ---------- Territory downloads (daily) ----------

const TERRITORY_CODES = ["US", "DE", "GB", "FR", "CA", "AU", "NL", "AT", "IT", "ES"];
const TERRITORY_WEIGHTS = [35, 15, 10, 8, 5, 5, 4, 3, 3, 2];

export const DAILY_TERRITORY_DOWNLOADS: Array<{ date: string; code: string; downloads: number }> = [];
for (let i = 0; i < DAY_COUNT; i++) {
  const dayTotal = firstTime[i] + redownload[i];
  for (let t = 0; t < TERRITORY_CODES.length; t++) {
    const downloads = Math.max(0, Math.round(
      dayTotal * (TERRITORY_WEIGHTS[t] / 100) + n(i * 10 + t, 50 + t) * 3,
    ));
    if (downloads > 0) {
      DAILY_TERRITORY_DOWNLOADS.push({ date: ANALYTICS_DAYS[i], code: TERRITORY_CODES[t], downloads });
    }
  }
}

// ---------- Aggregated / static data ----------

export const TERRITORIES = [
  { territory: "United States", code: "US", downloads: 2841, revenue: 1823 },
  { territory: "Germany", code: "DE", downloads: 1247, revenue: 892 },
  { territory: "United Kingdom", code: "GB", downloads: 834, revenue: 612 },
  { territory: "France", code: "FR", downloads: 621, revenue: 445 },
  { territory: "Canada", code: "CA", downloads: 412, revenue: 301 },
  { territory: "Australia", code: "AU", downloads: 389, revenue: 278 },
  { territory: "Netherlands", code: "NL", downloads: 267, revenue: 198 },
  { territory: "Austria", code: "AT", downloads: 198, revenue: 142 },
  { territory: "Italy", code: "IT", downloads: 178, revenue: 121 },
  { territory: "Spain", code: "ES", downloads: 134, revenue: 89 },
];

export const DISCOVERY_SOURCES = [
  { source: "search", count: 812, fill: "var(--color-search)" },
  { source: "browse", count: 451, fill: "var(--color-browse)" },
  { source: "webReferrer", count: 271, fill: "var(--color-webReferrer)" },
  { source: "unavailable", count: 268, fill: "var(--color-unavailable)" },
];

export const CRASHES_BY_VERSION = [
  { version: "1.1.0", platform: "macOS 26.2", crashes: 25, uniqueDevices: 5 },
  { version: "1.2.0", platform: "macOS 26.2", crashes: 3, uniqueDevices: 3 },
  { version: "1.3.1", platform: "macOS 26.3", crashes: 8, uniqueDevices: 4 },
  { version: "2.0.0", platform: "macOS 26.3", crashes: 11, uniqueDevices: 2 },
];

// ---------- Crashes by device ----------

export const CRASHES_BY_DEVICE = [
  { device: "MacBookPro18,1", crashes: 18, uniqueDevices: 4 },
  { device: "MacBookAir10,1", crashes: 9, uniqueDevices: 3 },
  { device: "Mac14,2", crashes: 7, uniqueDevices: 2 },
  { device: "iMac21,1", crashes: 6, uniqueDevices: 2 },
  { device: "Mac14,7", crashes: 4, uniqueDevices: 1 },
  { device: "Macmini9,1", crashes: 3, uniqueDevices: 2 },
];

// ---------- Types ----------

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
}

export function getMockAnalyticsData(_appId: string): AnalyticsData {
  return {
    dailyDownloads: DAILY_DOWNLOADS,
    dailyRevenue: DAILY_REVENUE,
    dailyEngagement: DAILY_ENGAGEMENT,
    dailySessions: DAILY_SESSIONS,
    dailyInstallsDeletes: DAILY_INSTALLS_DELETES,
    dailyDownloadsBySource: DAILY_DOWNLOADS_BY_SOURCE,
    dailyVersionSessions: DAILY_VERSION_SESSIONS,
    dailyOptIn: DAILY_OPT_IN,
    dailyWebPreview: DAILY_WEB_PREVIEW,
    dailyTerritoryDownloads: DAILY_TERRITORY_DOWNLOADS,
    territories: TERRITORIES,
    discoverySources: DISCOVERY_SOURCES,
    crashesByVersion: CRASHES_BY_VERSION,
    crashesByDevice: CRASHES_BY_DEVICE,
  };
}

// ---------- Utility ----------

export function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
