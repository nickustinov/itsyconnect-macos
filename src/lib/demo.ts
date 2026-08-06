import { db } from "@/db";
import { ascCredentials } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Demo mode detection
// ---------------------------------------------------------------------------

export function isDemoMode(): boolean {
  const cred = db
    .select({ isDemo: ascCredentials.isDemo })
    .from(ascCredentials)
    .where(and(eq(ascCredentials.isActive, true), eq(ascCredentials.isDemo, true)))
    .get();
  return !!cred;
}

// ---------------------------------------------------------------------------
// Demo app IDs (stable so deep links work)
// ---------------------------------------------------------------------------

const APP_1 = "demo-app-weatherly";
const APP_2 = "demo-app-trackfit";
const APP_3 = "demo-app-notepad";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function isoAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function generateDailyData<T>(days: number, fn: (date: string, i: number) => T): T[] {
  return Array.from({ length: days }, (_, i) => fn(daysAgo(days - 1 - i), i));
}

/** Seeded PRNG (mulberry32) – deterministic so charts don't change on reload. */
function seededRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a value around `center` with day-to-day noise + a gentle weekly pattern. */
function noisyValue(rng: () => number, center: number, variance: number, dayIndex: number): number {
  const weekday = dayIndex % 7;
  // Weekend dip (Sat/Sun = days 5,6 in a 0=Mon week, but we just use modulo pattern)
  const weeklyFactor = weekday >= 5 ? 0.82 : weekday === 0 ? 0.9 : 1.0;
  const noise = (rng() - 0.5) * 2 * variance;
  return Math.max(0, Math.round(center * weeklyFactor + noise));
}

// ---------------------------------------------------------------------------
// Demo apps
// ---------------------------------------------------------------------------

export const DEMO_APPS = [
  {
    id: APP_1,
    attributes: {
      name: "Weatherly",
      bundleId: "com.example.weatherly",
      sku: "WEATHERLY001",
      primaryLocale: "en-US",
      contentRightsDeclaration: null,
      subscriptionStatusUrl: null,
      subscriptionStatusUrlForSandbox: null,
      iconUrl: `demo:${APP_1}`,
    },
  },
  {
    id: APP_2,
    attributes: {
      name: "TrackFit",
      bundleId: "com.example.trackfit",
      sku: "TRACKFIT001",
      primaryLocale: "en-US",
      contentRightsDeclaration: null,
      subscriptionStatusUrl: null,
      subscriptionStatusUrlForSandbox: null,
      iconUrl: `demo:${APP_2}`,
    },
  },
  {
    id: APP_3,
    attributes: {
      name: "Notepad Pro",
      bundleId: "com.example.notepad-pro",
      sku: "NOTEPAD001",
      primaryLocale: "en-US",
      contentRightsDeclaration: null,
      subscriptionStatusUrl: null,
      subscriptionStatusUrlForSandbox: null,
      iconUrl: `demo:${APP_3}`,
    },
  },
];

// ---------------------------------------------------------------------------
// Demo analytics
// ---------------------------------------------------------------------------

function makeDemoAnalytics(appIndex: number) {
  const base = [120, 85, 40][appIndex];
  const revenueBase = [450, 220, 60][appIndex];
  const rng = seededRng(42 + appIndex * 1000);

  const dailyDownloads = generateDailyData(30, (date, i) => ({
    date,
    firstTime: noisyValue(rng, base, base * 0.35, i),
    redownload: noisyValue(rng, base * 0.2, base * 0.12, i),
    update: noisyValue(rng, base * 0.5, base * 0.2, i),
  }));

  const dailyRevenue = generateDailyData(30, (date, i) => ({
    date,
    proceeds: noisyValue(rng, revenueBase, revenueBase * 0.3, i),
    sales: noisyValue(rng, revenueBase * 1.3, revenueBase * 0.35, i),
  }));

  const dailyEngagement = generateDailyData(30, (date, i) => ({
    date,
    impressions: noisyValue(rng, base * 8, base * 2.5, i),
    pageViews: noisyValue(rng, base * 3, base * 1.2, i),
  }));

  const dailySessions = generateDailyData(30, (date, i) => ({
    date,
    sessions: noisyValue(rng, base * 4, base * 1.5, i),
    uniqueDevices: noisyValue(rng, base * 2.5, base * 0.8, i),
    avgDuration: Math.round(160 + rng() * 80),
  }));

  const dailyInstallsDeletes = generateDailyData(30, (date, i) => ({
    date,
    installs: noisyValue(rng, base * 0.9, base * 0.25, i),
    deletes: noisyValue(rng, base * 0.15, base * 0.08, i),
  }));

  const dailyDownloadsBySource = generateDailyData(30, (date, i) => ({
    date,
    search: noisyValue(rng, base * 0.5, base * 0.2, i),
    browse: noisyValue(rng, base * 0.25, base * 0.12, i),
    webReferrer: noisyValue(rng, base * 0.15, base * 0.08, i),
    unavailable: noisyValue(rng, base * 0.1, base * 0.04, i),
  }));

  const dailyVersionSessions = generateDailyData(30, (date, i) => ({
    date,
    v2_3_0: noisyValue(rng, base * 2, base * 0.7, i),
    v2_2_0: noisyValue(rng, Math.max(10, base * 1.5 - i * 3), base * 0.4, i),
    v2_1_0: noisyValue(rng, Math.max(0, base * 0.6 - i * 2), base * 0.2, i),
  }));

  const dailyOptIn = generateDailyData(30, (date, i) => ({
    date,
    downloading: noisyValue(rng, base * 0.7, base * 0.2, i),
    optingIn: noisyValue(rng, base * 0.3, base * 0.12, i),
  }));

  const dailyWebPreview = generateDailyData(30, (date, i) => ({
    date,
    pageViews: noisyValue(rng, base * 0.5, base * 0.2, i),
    appStoreTaps: noisyValue(rng, base * 0.2, base * 0.08, i),
  }));

  const dailyTerritoryDownloads = generateDailyData(30, (date, i) => ({
    date,
    code: "US",
    downloads: noisyValue(rng, base * 0.4, base * 0.15, i),
  }));

  const territories = [
    { territory: "United States", code: "US", downloads: base * 12, revenue: revenueBase * 10 },
    { territory: "United Kingdom", code: "GB", downloads: base * 4, revenue: revenueBase * 3 },
    { territory: "Germany", code: "DE", downloads: base * 3, revenue: revenueBase * 2 },
    { territory: "Japan", code: "JP", downloads: base * 3, revenue: revenueBase * 3 },
    { territory: "Canada", code: "CA", downloads: base * 2, revenue: revenueBase * 2 },
    { territory: "Australia", code: "AU", downloads: base * 2, revenue: revenueBase },
    { territory: "France", code: "FR", downloads: base * 2, revenue: revenueBase },
  ];

  const totalSearch = dailyDownloadsBySource.reduce((s, d) => s + d.search, 0);
  const totalBrowse = dailyDownloadsBySource.reduce((s, d) => s + d.browse, 0);
  const totalWeb = dailyDownloadsBySource.reduce((s, d) => s + d.webReferrer, 0);
  const totalUnavail = dailyDownloadsBySource.reduce((s, d) => s + d.unavailable, 0);

  const discoverySources = [
    { source: "search", count: totalSearch, fill: "var(--color-search)" },
    { source: "browse", count: totalBrowse, fill: "var(--color-browse)" },
    { source: "webReferrer", count: totalWeb, fill: "var(--color-webReferrer)" },
    { source: "unavailable", count: totalUnavail, fill: "var(--color-unavailable)" },
  ];

  const crashesByVersion = [
    { version: "2.3.0", platform: "iOS 18.2", crashes: 12, uniqueDevices: 10 },
    { version: "2.2.0", platform: "iOS 18.1", crashes: 8, uniqueDevices: 7 },
    { version: "2.1.0", platform: "iOS 17.6", crashes: 3, uniqueDevices: 3 },
  ];

  const crashesByDevice = [
    { device: "iPhone 16 Pro", crashes: 8, uniqueDevices: 6 },
    { device: "iPhone 15", crashes: 5, uniqueDevices: 4 },
    { device: "iPhone 14 Pro Max", crashes: 4, uniqueDevices: 3 },
    { device: "iPad Pro 13-inch (M4)", crashes: 3, uniqueDevices: 3 },
  ];

  const dailyCrashes = generateDailyData(30, (date, i) => ({
    date,
    crashes: noisyValue(rng, 3, 2, i),
    uniqueDevices: noisyValue(rng, 2, 1.5, i),
  }));

  return {
    dailyDownloads,
    dailyRevenue,
    dailyEngagement,
    dailySessions,
    dailyInstallsDeletes,
    dailyDownloadsBySource,
    dailyVersionSessions,
    dailyOptIn,
    dailyWebPreview,
    dailyTerritoryDownloads,
    territories,
    discoverySources,
    crashesByVersion,
    crashesByDevice,
    dailyCrashes,
    perfMetrics: [],
    perfRegressions: [],
  };
}

const DEMO_ANALYTICS: Record<string, ReturnType<typeof makeDemoAnalytics>> = {
  [APP_1]: makeDemoAnalytics(0),
  [APP_2]: makeDemoAnalytics(1),
  [APP_3]: makeDemoAnalytics(2),
};

// ---------------------------------------------------------------------------
// Demo versions
// ---------------------------------------------------------------------------

function makeDemoVersions(appIndex: number) {
  const versionStrings = ["2.3.0", "2.2.0", "2.1.0"];
  const states = ["READY_FOR_SALE", "READY_FOR_SALE", "READY_FOR_SALE"];
  if (appIndex === 0) states[0] = "READY_FOR_SALE";
  if (appIndex === 1) states[0] = "WAITING_FOR_REVIEW";

  return versionStrings.map((v, i) => ({
    id: `demo-version-${appIndex}-${i}`,
    attributes: {
      versionString: v,
      appVersionState: states[i],
      appStoreState: states[i],
      platform: "IOS",
      copyright: `Copyright ${new Date().getFullYear()} Example Inc.`,
      releaseType: i === 0 ? "AFTER_APPROVAL" : null,
      earliestReleaseDate: null,
      downloadable: i > 0,
      createdDate: isoAgo(i * 30 + 5),
      reviewType: null,
    },
    build: {
      id: `demo-build-ver-${appIndex}-${i}`,
      attributes: {
        version: `${100 + appIndex * 10 + (2 - i)}`,
        uploadedDate: isoAgo(i * 30 + 6),
        processingState: "VALID",
        minOsVersion: "17.0",
        iconAssetToken: null,
      },
    },
    reviewDetail: null,
    phasedRelease: null,
  }));
}

const DEMO_VERSIONS: Record<string, ReturnType<typeof makeDemoVersions>> = {
  [APP_1]: makeDemoVersions(0),
  [APP_2]: makeDemoVersions(1),
  [APP_3]: makeDemoVersions(2),
};

// ---------------------------------------------------------------------------
// Demo reviews
// ---------------------------------------------------------------------------

function makeDemoReviews(appIndex: number) {
  const reviewers = ["Alex M.", "Jordan S.", "Taylor R.", "Casey P.", "Morgan L."];
  const titles = [
    "Love this app!",
    "Great but could be better",
    "Exactly what I needed",
    "Solid update",
    "Works perfectly",
  ];
  const bodies = [
    "Been using this for months now and it just keeps getting better. The latest update added everything I was hoping for.",
    "Really good app overall. Would love to see dark mode support and better widget options in a future update.",
    "This is exactly the kind of app I've been looking for. Simple, clean, and does what it says.",
    "The new version fixed all the bugs I was experiencing. Runs smooth now. Great work!",
    "Does everything I need without unnecessary bloat. Highly recommend to anyone looking for a reliable tool.",
  ];
  const ratings = [5, 4, 5, 4, 5];
  const territories = ["USA", "GBR", "DEU", "JPN", "CAN"];

  return reviewers.map((reviewer, i) => ({
    id: `demo-review-${appIndex}-${i}`,
    attributes: {
      rating: ratings[i],
      title: titles[i],
      body: bodies[i],
      reviewerNickname: reviewer,
      createdDate: isoAgo(i * 3 + 1),
      territory: territories[i],
    },
  }));
}

const DEMO_REVIEWS: Record<string, ReturnType<typeof makeDemoReviews>> = {
  [APP_1]: makeDemoReviews(0),
  [APP_2]: makeDemoReviews(1),
  [APP_3]: makeDemoReviews(2),
};

// ---------------------------------------------------------------------------
// Demo TestFlight builds
// ---------------------------------------------------------------------------

function makeDemoBuilds(appIndex: number) {
  const buildBase = 100 + appIndex * 10;
  return [
    {
      id: `demo-tf-build-${appIndex}-0`,
      buildNumber: `${buildBase + 3}`,
      versionString: "2.3.0",
      platform: "IOS",
      status: "Testing",
      internalBuildState: "ACTIVE",
      externalBuildState: "READY_FOR_BETA_TESTING",
      uploadedDate: isoAgo(2),
      expirationDate: isoAgo(-88),
      expired: false,
      minOsVersion: "17.0",
      whatsNew: "Bug fixes and performance improvements.",
      whatsNewLocalizationId: null,
      groupIds: [`demo-group-${appIndex}-0`, `demo-group-${appIndex}-1`] as string[],
      iconUrl: null,
      installs: 48,
      sessions: 156,
      crashes: 2,
      invites: 12,
      feedbackCount: 3,
    },
    {
      id: `demo-tf-build-${appIndex}-1`,
      buildNumber: `${buildBase + 2}`,
      versionString: "2.2.0",
      platform: "IOS",
      status: "Testing",
      internalBuildState: "ACTIVE",
      externalBuildState: "READY_FOR_BETA_TESTING",
      uploadedDate: isoAgo(14),
      expirationDate: isoAgo(-76),
      expired: false,
      minOsVersion: "17.0",
      whatsNew: "New onboarding flow and improved search.",
      whatsNewLocalizationId: null,
      groupIds: [`demo-group-${appIndex}-0`] as string[],
      iconUrl: null,
      installs: 92,
      sessions: 340,
      crashes: 5,
      invites: 20,
      feedbackCount: 7,
    },
    {
      id: `demo-tf-build-${appIndex}-2`,
      buildNumber: `${buildBase + 1}`,
      versionString: "2.1.0",
      platform: "IOS",
      status: "Expired",
      internalBuildState: "ACTIVE",
      externalBuildState: "EXPIRED",
      uploadedDate: isoAgo(45),
      expirationDate: isoAgo(5),
      expired: true,
      minOsVersion: "17.0",
      whatsNew: null,
      whatsNewLocalizationId: null,
      groupIds: [] as string[],
      iconUrl: null,
      installs: 150,
      sessions: 520,
      crashes: 8,
      invites: 30,
      feedbackCount: 12,
    },
  ];
}

const DEMO_BUILDS: Record<string, ReturnType<typeof makeDemoBuilds>> = {
  [APP_1]: makeDemoBuilds(0),
  [APP_2]: makeDemoBuilds(1),
  [APP_3]: makeDemoBuilds(2),
};

// ---------------------------------------------------------------------------
// Demo TestFlight groups
// ---------------------------------------------------------------------------

function makeDemoGroups(appIndex: number) {
  return [
    {
      id: `demo-group-${appIndex}-0`,
      name: "Internal testers",
      isInternal: true,
      testerCount: 5,
      buildCount: 2,
      publicLinkEnabled: false,
      publicLink: null,
      publicLinkLimit: null,
      publicLinkLimitEnabled: false,
      feedbackEnabled: true,
      hasAccessToAllBuilds: true,
      createdDate: isoAgo(90),
    },
    {
      id: `demo-group-${appIndex}-1`,
      name: "Beta testers",
      isInternal: false,
      testerCount: 24,
      buildCount: 1,
      publicLinkEnabled: true,
      publicLink: "https://testflight.apple.com/join/AbCdEfGh",
      publicLinkLimit: 100,
      publicLinkLimitEnabled: true,
      feedbackEnabled: true,
      hasAccessToAllBuilds: false,
      createdDate: isoAgo(60),
    },
  ];
}

const DEMO_GROUPS: Record<string, ReturnType<typeof makeDemoGroups>> = {
  [APP_1]: makeDemoGroups(0),
  [APP_2]: makeDemoGroups(1),
  [APP_3]: makeDemoGroups(2),
};

// ---------------------------------------------------------------------------
// Demo pre-release versions
// ---------------------------------------------------------------------------

function makeDemoPreReleaseVersions(appIndex: number) {
  return [
    { id: `demo-prv-${appIndex}-0`, version: "2.3.0", platform: "IOS" },
    { id: `demo-prv-${appIndex}-1`, version: "2.2.0", platform: "IOS" },
    { id: `demo-prv-${appIndex}-2`, version: "2.1.0", platform: "IOS" },
  ];
}

const DEMO_PRE_RELEASE_VERSIONS: Record<string, ReturnType<typeof makeDemoPreReleaseVersions>> = {
  [APP_1]: makeDemoPreReleaseVersions(0),
  [APP_2]: makeDemoPreReleaseVersions(1),
  [APP_3]: makeDemoPreReleaseVersions(2),
};

// ---------------------------------------------------------------------------
// Demo TestFlight info
// ---------------------------------------------------------------------------

function makeDemoTFInfo(appIndex: number) {
  const appNames = ["Weatherly", "TrackFit", "Notepad Pro"];
  return {
    app: { id: [APP_1, APP_2, APP_3][appIndex] },
    localizations: [
      {
        id: `demo-tf-loc-${appIndex}-0`,
        locale: "en-US",
        description: `Try the latest beta of ${appNames[appIndex]}! Your feedback helps us build a better app.`,
        feedbackEmail: "beta@example.com",
        marketingUrl: null,
        privacyPolicyUrl: null,
      },
    ],
    reviewDetail: {
      id: `demo-tf-review-${appIndex}`,
      contactFirstName: "Jane",
      contactLastName: "Developer",
      contactPhone: "+1-555-0100",
      contactEmail: "jane@example.com",
      demoAccountRequired: false,
      demoAccountName: null,
      demoAccountPassword: null,
      notes: null,
    },
    licenseAgreement: {
      id: `demo-tf-license-${appIndex}`,
      agreementText: "",
    },
  };
}

const DEMO_TF_INFO: Record<string, ReturnType<typeof makeDemoTFInfo>> = {
  [APP_1]: makeDemoTFInfo(0),
  [APP_2]: makeDemoTFInfo(1),
  [APP_3]: makeDemoTFInfo(2),
};

// ---------------------------------------------------------------------------
// Demo app infos
// ---------------------------------------------------------------------------

function makeDemoAppInfos(appIndex: number) {
  const categoryIds = ["WEATHER", "HEALTH_AND_FITNESS", "PRODUCTIVITY"];
  return [
    {
      id: `demo-appinfo-${appIndex}`,
      attributes: {
        appStoreState: "READY_FOR_DISTRIBUTION",
        appStoreAgeRating: "FOUR_PLUS",
        brazilAgeRating: null,
        brazilAgeRatingV2: null,
        state: "READY_FOR_DISTRIBUTION",
      },
      primaryCategory: {
        id: categoryIds[appIndex],
        attributes: { platforms: ["IOS"], parent: null },
      },
      secondaryCategory: null,
    },
  ];
}

const DEMO_APP_INFOS: Record<string, ReturnType<typeof makeDemoAppInfos>> = {
  [APP_1]: makeDemoAppInfos(0),
  [APP_2]: makeDemoAppInfos(1),
  [APP_3]: makeDemoAppInfos(2),
};

// ---------------------------------------------------------------------------
// Demo version localizations (store listing)
// ---------------------------------------------------------------------------

function makeDemoVersionLocalizations(appIndex: number, versionIndex: number) {
  const descriptions = [
    [
      "Weatherly gives you beautiful, accurate weather forecasts at a glance. Check hourly and 10-day forecasts, severe weather alerts, and radar maps – all in a clean, intuitive interface.",
      "Major update with redesigned radar maps and improved hourly forecasts. Added severe weather alerts and a new widget for your home screen.",
      "Initial release of Weatherly with current conditions, hourly forecasts, and 10-day outlook.",
    ],
    [
      "TrackFit helps you reach your fitness goals with smart workout tracking, progress charts, and personalised plans. Supports running, cycling, strength training, and more.",
      "New social features: share workouts, challenge friends, and join community events. Improved heart rate zone tracking.",
      "First release of TrackFit with workout logging, basic stats, and Apple Health integration.",
    ],
    [
      "Notepad Pro is the note-taking app that stays out of your way. Markdown support, folders, tags, full-text search, and iCloud sync – everything you need, nothing you don't.",
      "Added tag-based organisation, improved Markdown editor with live preview, and faster full-text search.",
      "Simple, fast note-taking with Markdown support and iCloud sync.",
    ],
  ];

  const whatsNew = [
    "Bug fixes and performance improvements.\nImproved accessibility for VoiceOver users.\nNew widget options.",
    "Redesigned settings screen.\nFixed crash on older devices.\nUpdated localizations.",
    null,
  ];

  const keywords = [
    ["weather,forecast,radar,alerts,temperature,hourly,wind,humidity,uv", "fitness,workout,running,cycling,health,tracker,goals,exercise", "notes,markdown,writing,productivity,icloud,sync,tags,search"],
    ["weather,forecast,radar,alerts,temperature", "fitness,workout,running,health,tracker", "notes,markdown,writing,productivity"],
    ["weather,forecast,temperature", "fitness,workout,running", "notes,markdown,writing"],
  ];

  return [
    {
      id: `demo-ver-loc-${appIndex}-${versionIndex}-0`,
      attributes: {
        locale: "en-US",
        description: descriptions[appIndex][versionIndex],
        keywords: keywords[versionIndex][appIndex],
        marketingUrl: "https://example.com",
        promotionalText: versionIndex === 0 ? "Now with new widgets and improved performance!" : null,
        supportUrl: "https://example.com/support",
        whatsNew: whatsNew[versionIndex],
      },
    },
  ];
}

const DEMO_VERSION_LOCALIZATIONS: Record<string, ReturnType<typeof makeDemoVersionLocalizations>> = {};
for (let app = 0; app < 3; app++) {
  for (let ver = 0; ver < 3; ver++) {
    DEMO_VERSION_LOCALIZATIONS[`demo-version-${app}-${ver}`] = makeDemoVersionLocalizations(app, ver);
  }
}

// ---------------------------------------------------------------------------
// Demo app info localizations
// ---------------------------------------------------------------------------

function makeDemoAppInfoLocalizations(appIndex: number) {
  const names = ["Weatherly", "TrackFit", "Notepad Pro"];
  const subtitles = ["Your weather companion", "Fitness made simple", "Notes, reimagined"];
  return [
    {
      id: `demo-appinfo-loc-${appIndex}-0`,
      attributes: {
        locale: "en-US",
        name: names[appIndex],
        subtitle: subtitles[appIndex],
        privacyPolicyText: null,
        privacyPolicyUrl: "https://example.com/privacy",
        privacyChoicesUrl: null,
      },
    },
  ];
}

const DEMO_APP_INFO_LOCALIZATIONS: Record<string, ReturnType<typeof makeDemoAppInfoLocalizations>> = {
  "demo-appinfo-0": makeDemoAppInfoLocalizations(0),
  "demo-appinfo-1": makeDemoAppInfoLocalizations(1),
  "demo-appinfo-2": makeDemoAppInfoLocalizations(2),
};

// ---------------------------------------------------------------------------
// Public data accessors
// ---------------------------------------------------------------------------

export function getDemoApps() {
  return DEMO_APPS;
}

export function getDemoAnalytics(appId: string) {
  return DEMO_ANALYTICS[appId] ?? null;
}

export function getDemoVersions(appId: string) {
  return DEMO_VERSIONS[appId] ?? [];
}

export function getDemoReviews(appId: string) {
  return DEMO_REVIEWS[appId] ?? [];
}

export function getDemoBuilds(appId: string) {
  return DEMO_BUILDS[appId] ?? [];
}

export function getDemoGroups(appId: string) {
  return DEMO_GROUPS[appId] ?? [];
}

export function getDemoPreReleaseVersions(appId: string) {
  return DEMO_PRE_RELEASE_VERSIONS[appId] ?? [];
}

export function getDemoTFInfo(appId: string) {
  return DEMO_TF_INFO[appId] ?? null;
}

export function getDemoAppInfos(appId: string) {
  return DEMO_APP_INFOS[appId] ?? [];
}

export function getDemoAppInfoLocalizations(appInfoId: string) {
  return DEMO_APP_INFO_LOCALIZATIONS[appInfoId] ?? [];
}

export function getDemoVersionLocalizations(versionId: string) {
  return DEMO_VERSION_LOCALIZATIONS[versionId] ?? [];
}

export function getDemoBuildDetail(appId: string, buildId: string) {
  const builds = DEMO_BUILDS[appId];
  return builds?.find((b) => b.id === buildId) ?? null;
}

const DEMO_TESTERS = [
  { id: "demo-tester-0", firstName: "Jane", lastName: "Appleseed", email: "jane@example.com", inviteType: "EMAIL", state: "ACCEPTED", sessions: 42, crashes: 1, feedbackCount: 2 },
  { id: "demo-tester-1", firstName: "Alex", lastName: "Morgan", email: "alex@example.com", inviteType: "EMAIL", state: "ACCEPTED", sessions: 28, crashes: 0, feedbackCount: 1 },
  { id: "demo-tester-2", firstName: "Sam", lastName: "Chen", email: "sam@example.com", inviteType: "EMAIL", state: "ACCEPTED", sessions: 15, crashes: 0, feedbackCount: 0 },
  { id: "demo-tester-3", firstName: "Taylor", lastName: "Kim", email: "taylor@example.com", inviteType: "PUBLIC_LINK", state: "ACCEPTED", sessions: 8, crashes: 1, feedbackCount: 3 },
  { id: "demo-tester-4", firstName: "Jordan", lastName: "Lee", email: "jordan@example.com", inviteType: "EMAIL", state: "NOT_YET_ACCEPTED", sessions: 0, crashes: 0, feedbackCount: 0 },
];

export function getDemoGroupDetail(appId: string, groupId: string) {
  const groups = DEMO_GROUPS[appId];
  const group = groups?.find((g) => g.id === groupId);
  if (!group) return null;

  const builds = DEMO_BUILDS[appId];
  /* v8 ignore next -- @preserve */
  if (!builds) return null;
  const groupBuilds = builds.filter((b) => b.groupIds.includes(groupId));
  const testerCount = group.isInternal ? 5 : 4;

  return {
    group,
    builds: groupBuilds,
    testers: DEMO_TESTERS.slice(0, testerCount),
  };
}
