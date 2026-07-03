"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  DownloadSimple,
  CurrencyDollar,
  AppWindow,
} from "@phosphor-icons/react";
import { getLastUrl } from "@/lib/nav-state";
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  type ChartConfig,
} from "@/components/ui/chart";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { AppIcon } from "@/components/app-icon";
import { DateRangePicker } from "@/components/analytics-range-picker";
import { useApps } from "@/lib/apps-context";
import { useRegisterRefresh } from "@/lib/refresh-context";
import { formatDateShort } from "@/lib/format";
import { parseRange, filterByDateRange } from "@/lib/analytics-range";
import { usePersistedRange } from "@/lib/hooks/use-persisted-range";
import type { AnalyticsData } from "@/lib/asc/analytics";
import {
  STATE_DOT_COLORS,
  type AscVersion,
} from "@/lib/asc/version-types";
import { ReportInitiatedBanner } from "@/components/report-initiated-banner";
import { useTranslations } from "@/lib/i18n/locale-context";
import { useAscLabels } from "@/lib/i18n/use-asc-labels";

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

interface AppAnalytics {
  data: AnalyticsData | null;
  loading: boolean;
  pending: boolean;
  reportInitiated: boolean;
  initiatedAt: number | null;
}

export default function DashboardPage() {
  const t = useTranslations();
  const { platformLabel, versionStateLabel } = useAscLabels();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { apps, loading } = useApps();
  const devSimulate = searchParams.get("analyticsState") === "initiated";
  const [analytics, setAnalytics] = useState<Record<string, AppAnalytics>>({});
  const [appVersions, setAppVersions] = useState<Record<string, AscVersion[]>>({});
  const [range, setRange] = usePersistedRange("range:portfolio-proceeds");
  // App names (and "Total") toggled off in the chart legend – excluded from the chart and KPIs.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggleLine = useCallback((key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // entry=1 means proxy redirected here on app launch – restore last URL
  const isEntry = searchParams.get("entry") === "1";

  useEffect(() => {
    if (!isEntry || loading || apps.length === 0) return;

    const saved = getLastUrl();

    // Existing user – restore last URL
    if (saved) {
      if (saved === "/dashboard") {
        router.replace("/dashboard");
        return;
      }
      const savedAppId = saved.match(/^\/dashboard\/apps\/([^/?]+)/)?.[1];
      const appIds = new Set(apps.map((a) => a.id));
      if (savedAppId && appIds.has(savedAppId)) {
        router.replace(saved);
        return;
      }
    }

    // Default: go to first app
    router.replace(`/dashboard/apps/${apps[0].id}`);
  }, [isEntry, apps, loading, router]);

  const fetchAnalytics = useCallback(async (appId: string) => {
    try {
      const res = await fetch(`/api/apps/${appId}/analytics`);
      const json = await res.json();
      setAnalytics((prev) => {
        // Don't wipe existing data when pending
        if (json.pending && prev[appId]?.data) {
          return { ...prev, [appId]: { ...prev[appId], pending: true } };
        }
        return {
          ...prev,
          [appId]: {
            data: json.data ?? null,
            loading: false,
            pending: json.pending ?? false,
            reportInitiated: json.reportInitiated === true,
            initiatedAt: json.initiatedAt ?? null,
          },
        };
      });
    } catch {
      setAnalytics((prev) => ({
        ...prev,
        [appId]: { data: null, loading: false, pending: false, reportInitiated: false, initiatedAt: null },
      }));
    }
  }, []);

  const fetchVersions = useCallback(async (appId: string) => {
    try {
      const res = await fetch(`/api/apps/${appId}/versions`);
      const json = await res.json();
      setAppVersions((prev) => ({ ...prev, [appId]: json.versions ?? [] }));
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    if (loading || apps.length === 0) return;

    const initial: Record<string, AppAnalytics> = {};
    for (const app of apps) {
      initial[app.id] = { data: null, loading: true, pending: false, reportInitiated: false, initiatedAt: null };
    }
    setAnalytics(initial);

    for (const app of apps) {
      fetchAnalytics(app.id);
      fetchVersions(app.id);
    }
  }, [apps, loading, fetchAnalytics, fetchVersions]);

  // Poll while any app is pending
  const hasPending = Object.values(analytics).some((a) => a.pending);
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => {
      for (const app of apps) {
        fetchAnalytics(app.id);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [hasPending, apps, fetchAnalytics]);

  // Refresh handler for header button
  const [refreshing, setRefreshing] = useState(false);
  const appsRef = useRef(apps);
  appsRef.current = apps;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const currentApps = appsRef.current;
      await Promise.all(
        currentApps.map((app) =>
          fetch(`/api/apps/${app.id}/analytics/refresh`, { method: "POST" }),
        ),
      );
      await Promise.all(
        currentApps.flatMap((app) => [fetchAnalytics(app.id), fetchVersions(app.id)]),
      );
    } finally {
      setRefreshing(false);
    }
  }, [fetchAnalytics, fetchVersions]);

  useRegisterRefresh({
    onRefresh: handleRefresh,
    busy: refreshing || hasPending,
  });

  const parsed = useMemo(() => parseRange(range), [range]);

  // Aggregated KPIs over the currently visible apps (legend toggles exclude apps).
  const { totalDownloads, totalProceeds, rangeProceeds, proceedsYesterday } = useMemo(() => {
    let downloads = 0;
    let proceeds = 0;
    let rangeProc = 0;
    let latestDate = "";
    const sortedRevByApp: { date: string; proceeds: number }[][] = [];

    for (const app of apps) {
      if (hidden.has(app.name)) continue;
      const entry = analytics[app.id];
      if (!entry?.data) continue;
      for (const d of entry.data.dailyDownloads) {
        downloads += d.firstTime + d.redownload;
      }
      const rev = entry.data.dailyRevenue;
      for (const r of rev) {
        proceeds += r.proceeds;
      }
      for (const r of filterByDateRange(rev, parsed)) {
        rangeProc += r.proceeds;
      }
      // Yesterday = most recent complete day across visible apps
      const sorted = [...rev].sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length > 0 && sorted[sorted.length - 1].date > latestDate) {
        latestDate = sorted[sorted.length - 1].date;
      }
      sortedRevByApp.push(sorted);
    }
    let pYesterday = 0;
    for (const sorted of sortedRevByApp) {
      const entry = sorted.find((r) => r.date === latestDate);
      if (entry) pYesterday += entry.proceeds;
    }
    return { totalDownloads: downloads, totalProceeds: proceeds, rangeProceeds: rangeProc, proceedsYesterday: pYesterday };
  }, [apps, analytics, parsed, hidden]);

  // Proceeds chart data: merge all apps' dailyRevenue by date
  const { chartData, chartConfig } = useMemo(() => {
    const dateMap: Record<string, Record<string, number>> = {};
    const appNames: string[] = [];

    for (const app of apps) {
      const entry = analytics[app.id];
      if (!entry?.data) continue;
      appNames.push(app.name);
      const filtered = filterByDateRange(entry.data.dailyRevenue, parsed);
      for (const r of filtered) {
        if (!dateMap[r.date]) dateMap[r.date] = {};
        dateMap[r.date][app.name] = r.proceeds;
      }
    }

    const dates = Object.keys(dateMap).sort();
    const data = dates.map((date) => {
      const row: Record<string, string | number> = { date };
      let total = 0;
      for (const name of appNames) {
        const val = dateMap[date][name] ?? 0;
        row[name] = val;
        if (!hidden.has(name)) total += val;
      }
      row["Total"] = total;
      return row;
    });

    const config: ChartConfig = {};
    for (let i = 0; i < appNames.length; i++) {
      config[appNames[i]] = {
        label: appNames[i],
        color: CHART_COLORS[i % CHART_COLORS.length],
      };
    }
    config["Total"] = {
      label: t("dashboard.total"),
      color: "oklch(from var(--foreground) l c h / 0.3)",
    };

    return { chartData: data, chartConfig: config };
  }, [apps, analytics, parsed, hidden, t]);

  const appNames = useMemo(
    () => Object.keys(chartConfig).filter((k) => k !== "Total"),
    [chartConfig],
  );

  if (isEntry) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background">
        <div className="drag fixed inset-x-0 top-0 h-16" />
        <Spinner className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("dashboard.gettingReady")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <EmptyState
        icon={AppWindow}
        title={t("dashboard.noAppsTitle")}
        description={
          <>
            {t("dashboard.noAppsDescriptionPrefix")}{" "}
            <a
              href="https://appstoreconnect.apple.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              App Store Connect
            </a>{" "}
            {t("dashboard.noAppsDescriptionSuffix")}
          </>
        }
      />
    );
  }

  const anyLoaded = Object.values(analytics).some((a) => !a.loading);
  const allPending = Object.values(analytics).length > 0
    && Object.values(analytics).every((a) => !a.loading && a.pending && !a.data);
  const anyInitiated = Object.values(analytics).some((a) => a.reportInitiated && !a.data);
  const earliestInitiatedAt = Object.values(analytics)
    .filter((a) => a.initiatedAt)
    .reduce<number | null>((min, a) => (min === null || (a.initiatedAt! < min) ? a.initiatedAt! : min), null);
  const noData = anyLoaded
    && Object.values(analytics).every((a) => !a.loading && !a.data);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={t("dashboard.totalDownloads")}
          value={anyLoaded ? totalDownloads.toLocaleString() : "–"}
          icon={DownloadSimple}
        />
        <KpiCard
          title={t("dashboard.totalProceeds")}
          value={anyLoaded ? `$${totalProceeds.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "–"}
          icon={CurrencyDollar}
        />
        <KpiCard
          title={t("dashboard.rangeProceeds")}
          value={anyLoaded ? `$${rangeProceeds.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "–"}
          icon={CurrencyDollar}
        />
        <KpiCard
          title={t("dashboard.proceedsYesterday")}
          value={anyLoaded ? `$${proceedsYesterday.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "–"}
          icon={CurrencyDollar}
        />
      </div>

      {/* Proceeds chart */}
      {devSimulate ? (
        <ReportInitiatedBanner initiatedAt={Date.now() - 2 * 60 * 60 * 1000} />
      ) : anyInitiated && !anyLoaded ? (
        <ReportInitiatedBanner initiatedAt={earliestInitiatedAt} />
      ) : allPending || (!anyLoaded && Object.keys(analytics).length > 0) ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Spinner className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t("dashboard.fetchingAnalytics")}
          </p>
        </div>
      ) : noData ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("dashboard.noAnalyticsData")}
        </div>
      ) : anyLoaded ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">{t("dashboard.proceeds")}</CardTitle>
            <DateRangePicker value={range} onChange={setRange} />
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[280px] w-full">
                <LineChart data={chartData} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={formatDateShort}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={50}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(v) => formatDateShort(v as string)}
                        formatter={(value, name) => (
                          <div className="flex flex-1 items-center justify-between gap-2 leading-none">
                            <span className="text-muted-foreground">{name}</span>
                            <span className="font-mono font-medium tabular-nums">
                              ${(value as number).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        )}
                      />
                    }
                  />
                  <ChartLegend content={<InteractiveLegend hidden={hidden} onToggle={toggleLine} />} />
                  {appNames.map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      hide={hidden.has(name)}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="Total"
                    stroke="oklch(from var(--foreground) l c h / 0.3)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    hide={hidden.has("Total")}
                  />
                </LineChart>
              </ChartContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {t("dashboard.noDataForRange")}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* App cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => {
          const entry = analytics[app.id];
          const versions = pickPendingVersions(appVersions[app.id] ?? []);
          return (
            <Link key={app.id} href={`/dashboard/apps/${app.id}`}>
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                  <AppIcon iconUrl={app.iconUrl} name={app.name} />
                  <CardTitle className="text-sm font-medium truncate">
                    {app.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {entry?.loading ? (
                    <Spinner className="size-4 text-muted-foreground" />
                  ) : (entry?.reportInitiated || devSimulate) && !entry?.data ? (
                    <p className="text-xs text-muted-foreground">{t("dashboard.awaitingData")}</p>
                  ) : entry?.pending ? (
                    <p className="text-xs text-muted-foreground">{t("dashboard.pending")}</p>
                  ) : entry?.data ? (
                    <AppCardStats data={entry.data} />
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("dashboard.noData")}</p>
                  )}
                  {versions.length > 0 && (
                    <div className="mt-3 space-y-0.5 border-t pt-3">
                      {versions.map((v) => (
                        <div key={v.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={`size-1.5 shrink-0 rounded-full ${STATE_DOT_COLORS[v.attributes.appVersionState] ?? "bg-muted-foreground"}`} />
                          <span className="truncate">
                            {platformLabel(v.attributes.platform)}{" "}
                            {v.attributes.versionString}{" "}
                            {versionStateLabel(v.attributes.appVersionState)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

interface LegendItem {
  value: string;
  color?: string;
  type?: string;
}

/** Clickable chart legend – toggling an entry hides its line and updates the KPIs above. */
function InteractiveLegend({
  payload,
  hidden,
  onToggle,
}: {
  payload?: LegendItem[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (!payload?.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
      {payload
        .filter((item) => item.type !== "none")
        .map((item) => {
          const off = hidden.has(item.value);
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onToggle(item.value)}
              className={`flex items-center gap-1.5 text-xs transition-opacity hover:opacity-80 ${off ? "opacity-40" : ""}`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color }}
              />
              <span className={off ? "line-through" : ""}>{item.value}</span>
            </button>
          );
        })}
    </div>
  );
}

const LIVE_STATES = new Set(["READY_FOR_SALE", "READY_FOR_DISTRIBUTION"]);

/** Pick non-live versions to show in portfolio cards (newest per platform). */
function pickPendingVersions(versions: AscVersion[]): AscVersion[] {
  const seen = new Set<string>();
  const result: AscVersion[] = [];
  for (const v of versions) {
    if (LIVE_STATES.has(v.attributes.appVersionState)) continue;
    const p = v.attributes.platform;
    if (seen.has(p)) continue;
    seen.add(p);
    result.push(v);
  }
  return result;
}

function AppCardStats({ data }: { data: AnalyticsData }) {
  const downloads = data.dailyDownloads.reduce(
    (sum, d) => sum + d.firstTime + d.redownload,
    0,
  );
  const proceeds = data.dailyRevenue.reduce(
    (sum, r) => sum + r.proceeds,
    0,
  );

  const totalDevices = data.dailySessions.reduce(
    (sum, s) => sum + s.uniqueDevices,
    0,
  );
  const crashDevices = data.crashesByVersion.reduce(
    (sum, c) => sum + c.uniqueDevices,
    0,
  );
  const crashFree =
    totalDevices > 0
      ? ((1 - crashDevices / totalDevices) * 100).toFixed(1)
      : null;

  return (
    <div className="grid grid-cols-3 gap-3 text-xs tabular-nums">
      <div>
        <p className="text-muted-foreground">Downloads</p>
        <p className="font-medium">{downloads.toLocaleString()}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Proceeds</p>
        <p className="font-medium">${proceeds.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
      </div>
      {crashFree && (
        <div>
          <p className="text-muted-foreground">Crash-free</p>
          <p className="font-medium">{crashFree}%</p>
        </div>
      )}
    </div>
  );
}
