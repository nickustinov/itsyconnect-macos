"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import {
  STATE_DOT_COLORS,
  type AscVersion,
} from "@/lib/asc/version-types";
import { useTranslations } from "@/lib/i18n/locale-context";
import { useAscLabels } from "@/lib/i18n/use-asc-labels";
import { AppIcon } from "@/components/app-icon";
import { KpiCard } from "@/components/kpi-card";
import {
  DownloadSimple,
  CurrencyDollar,
  ShieldCheck,
  BookmarkSimple,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { MarkersDialog } from "@/components/markers-dialog";
import { useAppMarkers } from "@/lib/hooks/use-app-markers";
import { renderMarkers } from "@/components/chart-markers";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { DateRangePicker } from "@/components/analytics-range-picker";
import { usePersistedRange } from "@/lib/hooks/use-persisted-range";
import { parseRange, filterByDateRange } from "@/lib/analytics-range";
import type { AnalyticsData } from "@/lib/asc/analytics";
import { formatDateShort } from "@/lib/format";
import { ReportInitiatedBanner } from "@/components/report-initiated-banner";

// ---------- Constants ----------

const LIVE_STATES = new Set([
  "READY_FOR_SALE",
  "READY_FOR_DISTRIBUTION",
  "ACCEPTED",
]);

const STATE_BADGE_CLASSES: Record<string, string> = {
  READY_FOR_SALE: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/25",
  READY_FOR_DISTRIBUTION: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/25",
  ACCEPTED: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/25",
  IN_REVIEW: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
  WAITING_FOR_REVIEW: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  PREPARE_FOR_SUBMISSION: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/25",
  REJECTED: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
  METADATA_REJECTED: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
  DEVELOPER_REJECTED: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
};

/**
 * Pick at most 2 versions per platform for the overview:
 * the newest live version + the newest non-live version (if any).
 */
function pickOverviewVersions(versions: AscVersion[]): AscVersion[] {
  const byPlatform = new Map<string, AscVersion[]>();
  for (const v of versions) {
    const p = v.attributes.platform;
    if (!byPlatform.has(p)) byPlatform.set(p, []);
    byPlatform.get(p)!.push(v);
  }

  const result: AscVersion[] = [];
  for (const platformVersions of byPlatform.values()) {
    // ASC returns newest first
    const live = platformVersions.find((v) =>
      LIVE_STATES.has(v.attributes.appVersionState),
    );
    const pending = platformVersions.find(
      (v) => !LIVE_STATES.has(v.attributes.appVersionState),
    );
    // Show pending first (actionable), then live
    if (pending) result.push(pending);
    if (live) result.push(live);
  }
  return result;
}

// ---------- Chart configs ----------

const downloadsConfigBase = {
  firstTime: { labelKey: "overview.firstTimeDownloads" as const, color: "var(--color-chart-1)" },
  redownload: { labelKey: "overview.redownloads" as const, color: "var(--color-chart-2)" },
};

const proceedsConfigBase = {
  proceeds: { labelKey: "overview.totalProceeds" as const, color: "var(--color-chart-1)" },
};

// ---------- Page ----------

export default function AppOverviewPage() {
  const { appId } = useParams<{ appId: string }>();
  const t = useTranslations();
  const { platformLabel, versionStateLabel } = useAscLabels();
  const { apps, loading: appsLoading } = useApps();
  const { versions, loading: versionsLoading } = useVersions();
  const app = apps.find((a) => a.id === appId);

  const searchParams = useSearchParams();
  const devSimulate = searchParams.get("analyticsState") === "initiated";
  const [devSimulateTime] = useState(() => Date.now() - 2 * 60 * 60 * 1000);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [pending, setPending] = useState(false);
  const [reportInitiated, setReportInitiated] = useState(false);
  const [initiatedAt, setInitiatedAt] = useState<number | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [downloadsRange, setDownloadsRange] = usePersistedRange("range:overview-downloads");
  const [proceedsRange, setProceedsRange] = usePersistedRange("range:overview-proceeds");
  const [markersOpen, setMarkersOpen] = useState(false);
  const { markers } = useAppMarkers(appId);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/apps/${appId}/analytics`)
      .then((r) => r.json())
      .then((res: { data: AnalyticsData | null; pending?: boolean; reportInitiated?: boolean; initiatedAt?: number }) => {
        if (cancelled) return;
        setAnalytics(res.data);
        setPending(res.pending === true && !res.data);
        setReportInitiated(res.reportInitiated === true);
        setInitiatedAt(res.initiatedAt ?? null);
        setAnalyticsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });
    return () => { cancelled = true; };
  }, [appId]);

  const parsedDownloads = useMemo(() => parseRange(downloadsRange), [downloadsRange]);
  const parsedProceeds = useMemo(() => parseRange(proceedsRange), [proceedsRange]);

  // All-time KPI stats
  const totalDownloads = (analytics?.dailyDownloads ?? []).reduce(
    (s, d) => s + d.firstTime + d.redownload,
    0,
  );
  const totalProceeds = (analytics?.dailyRevenue ?? []).reduce(
    (s, d) => s + d.proceeds,
    0,
  );
  const totalDevices = (analytics?.dailySessions ?? []).reduce(
    (s, d) => s + d.uniqueDevices,
    0,
  );
  const crashDevices = (analytics?.crashesByVersion ?? []).reduce(
    (s, c) => s + c.uniqueDevices,
    0,
  );
  const crashFreeRate =
    totalDevices > 0
      ? ((1 - crashDevices / totalDevices) * 100).toFixed(1)
      : "100";

  // Filtered chart data
  const filteredDownloads = useMemo(
    () => filterByDateRange(analytics?.dailyDownloads ?? [], parsedDownloads),
    [analytics, parsedDownloads],
  );
  const filteredRevenue = useMemo(
    () => filterByDateRange(analytics?.dailyRevenue ?? [], parsedProceeds),
    [analytics, parsedProceeds],
  );

  const downloadsConfig = useMemo(
    () => ({
      firstTime: { label: t(downloadsConfigBase.firstTime.labelKey), color: downloadsConfigBase.firstTime.color },
      redownload: { label: t(downloadsConfigBase.redownload.labelKey), color: downloadsConfigBase.redownload.color },
    }) satisfies ChartConfig,
    [t],
  );

  const proceedsConfig = useMemo(
    () => ({
      proceeds: { label: t("dashboard.proceeds"), color: proceedsConfigBase.proceeds.color },
    }) satisfies ChartConfig,
    [t],
  );

  if (appsLoading || versionsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (!app) {
    return <EmptyState title={t("app.notFound")} />;
  }

  return (
    <div className="space-y-6">
      {/* App header */}
      <div className="flex items-center gap-4">
        <AppIcon
          iconUrl={app.iconUrl}
          name={app.name}
          className="size-14"
          iconSize={28}
        />
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{app.name}</h1>
          <p className="text-sm text-muted-foreground">{app.bundleId}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setMarkersOpen(true)}>
          <BookmarkSimple size={14} />
          {t("overview.markers")}
          {markers.length > 0 && (
            <span className="ml-1 text-xs text-muted-foreground">
              {markers.length}
            </span>
          )}
        </Button>
      </div>

      <MarkersDialog appId={appId} open={markersOpen} onOpenChange={setMarkersOpen} />

      {/* Version status cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pickOverviewVersions(versions).map((version) => (
          <Link
            key={version.id}
            href={`/dashboard/apps/${appId}/store-listing?version=${version.id}`}
            className="block h-full"
          >
            <Card className="flex h-full flex-col transition-colors hover:bg-accent/50">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-sm font-medium">
                    {platformLabel(version.attributes.platform)}
                  </CardTitle>
                  {version.build && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("overview.build")} {version.build.attributes.version} &middot;{" "}
                      {new Date(version.build.attributes.uploadedDate).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  )}
                </div>
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${STATE_BADGE_CLASSES[version.attributes.appVersionState] ?? "bg-muted text-muted-foreground border-border"}`}
                >
                  {versionStateLabel(version.attributes.appVersionState)}
                </span>
              </CardHeader>
              <CardContent className="mt-auto">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold font-mono">
                    {version.attributes.versionString}
                  </span>
                  <span
                    className={`size-2 rounded-full ${STATE_DOT_COLORS[version.attributes.appVersionState] ?? "bg-muted-foreground"}`}
                  />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Analytics: KPI cards + charts, or pending placeholder */}
      {analyticsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      ) : devSimulate ? (
        <ReportInitiatedBanner initiatedAt={devSimulateTime} />
      ) : reportInitiated && !analytics ? (
        <ReportInitiatedBanner initiatedAt={initiatedAt} />
      ) : pending ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("overview.fetchingHistorical")}
          </CardContent>
        </Card>
      ) : analytics ? (
        <>
          {/* KPI cards – all-time stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              title={t("overview.totalDownloads")}
              value={totalDownloads.toLocaleString()}
              subtitle={t("overview.allTime")}
              icon={DownloadSimple}
            />
            <KpiCard
              title={t("overview.totalProceeds")}
              value={`$${totalProceeds.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              subtitle={t("overview.allTime")}
              icon={CurrencyDollar}
            />
            <KpiCard
              title={t("overview.crashFreeRate")}
              value={`${crashFreeRate}%`}
              subtitle={crashDevices > 0 ? t("overview.affectedDevices", { count: crashDevices }) : t("overview.allTime")}
              icon={ShieldCheck}
            />
          </div>

          {/* Charts row */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium">
                  {t("overview.downloads")}
                </CardTitle>
                <DateRangePicker value={downloadsRange} onChange={setDownloadsRange} />
              </CardHeader>
              <CardContent>
                {filteredDownloads.length > 0 ? (
                  <ChartContainer
                    config={downloadsConfig}
                    className="h-[240px] w-full"
                  >
                    <BarChart data={filteredDownloads} accessibilityLayer>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={formatDateShort}
                        interval="preserveStartEnd"
                      />
                      <YAxis tickLine={false} axisLine={false} width={40} />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelFormatter={(v) => formatDateShort(v as string)}
                          />
                        }
                      />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar
                        dataKey="firstTime"
                        stackId="downloads"
                        fill="var(--color-firstTime)"
                      />
                      <Bar
                        dataKey="redownload"
                        stackId="downloads"
                        fill="var(--color-redownload)"
                        radius={[2, 2, 0, 0]}
                      />
                      {renderMarkers({
                        markers,
                        visibleDates: filteredDownloads.map((d) => d.date),
                      })}
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {t("overview.noDataForPeriod")}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium">
                  {t("dashboard.proceeds")}
                </CardTitle>
                <DateRangePicker value={proceedsRange} onChange={setProceedsRange} />
              </CardHeader>
              <CardContent>
                {filteredRevenue.length > 0 ? (
                  <ChartContainer
                    config={proceedsConfig}
                    className="h-[240px] w-full"
                  >
                    <LineChart data={filteredRevenue} accessibilityLayer>
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
                            formatter={(value) => (
                              <div className="flex flex-1 items-center justify-between gap-2 leading-none">
                                <span className="text-muted-foreground">{t("dashboard.proceeds")}</span>
                                <span className="font-mono font-medium tabular-nums">
                                  ${(value as number).toLocaleString()}
                                </span>
                              </div>
                            )}
                          />
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="proceeds"
                        stroke="var(--color-proceeds)"
                        strokeWidth={2}
                        dot={false}
                      />
                      {renderMarkers({
                        markers,
                        visibleDates: filteredRevenue.map((d) => d.date),
                      })}
                    </LineChart>
                  </ChartContainer>
                ) : (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {t("overview.noDataForPeriod")}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
