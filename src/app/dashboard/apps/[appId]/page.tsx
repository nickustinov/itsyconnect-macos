"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import {
  PLATFORM_LABELS,
  STATE_DOT_COLORS,
  stateLabel,
  type AscVersion,
} from "@/lib/asc/version-types";
import { AppIcon } from "@/components/app-icon";
import { KpiCard } from "@/components/kpi-card";
import {
  DownloadSimple,
  CurrencyDollar,
  ShieldCheck,
} from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
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
import { type AnalyticsData, formatDate } from "@/lib/mock-analytics";

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

const downloadsConfig = {
  firstTime: { label: "First-time downloads", color: "var(--color-chart-1)" },
  redownload: { label: "Redownloads", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

const proceedsConfig = {
  proceeds: { label: "Proceeds", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

// ---------- Page ----------

export default function AppOverviewPage() {
  const { appId } = useParams<{ appId: string }>();
  const { apps, loading: appsLoading } = useApps();
  const { versions, loading: versionsLoading } = useVersions();
  const app = apps.find((a) => a.id === appId);

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [pending, setPending] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/apps/${appId}/analytics`)
      .then((r) => r.json())
      .then((res: { data: AnalyticsData | null; pending?: boolean }) => {
        if (cancelled) return;
        setAnalytics(res.data);
        setPending(res.pending === true && !res.data);
        setAnalyticsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });
    return () => { cancelled = true; };
  }, [appId]);

  if (appsLoading || versionsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        App not found
      </div>
    );
  }

  // Last 30 days of data
  const last30Downloads = (analytics?.dailyDownloads ?? []).slice(-30);
  const last30Revenue = (analytics?.dailyRevenue ?? []).slice(-30);
  const last30Sessions = (analytics?.dailySessions ?? []).slice(-30);

  const totalDownloads = last30Downloads.reduce(
    (s, d) => s + d.firstTime + d.redownload,
    0,
  );
  const totalProceeds = last30Revenue.reduce(
    (s, d) => s + d.proceeds,
    0,
  );
  const totalDevices = last30Sessions.reduce(
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
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{app.name}</h1>
          <p className="text-sm text-muted-foreground">{app.bundleId}</p>
        </div>
      </div>

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
                    {PLATFORM_LABELS[version.attributes.platform] ?? version.attributes.platform}
                  </CardTitle>
                  {version.build && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Build {version.build.attributes.version} &middot;{" "}
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
                  {stateLabel(version.attributes.appVersionState)}
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

      {/* Analytics: KPI cards + chart, or pending placeholder */}
      {analyticsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      ) : pending ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Initial update in progress. Insights will be available shortly.
          </CardContent>
        </Card>
      ) : analytics ? (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              title="Total downloads"
              value={totalDownloads.toLocaleString()}
              icon={DownloadSimple}
            />
            <KpiCard
              title="Proceeds"
              value={`$${totalProceeds.toLocaleString()}`}
              icon={CurrencyDollar}
            />
            <KpiCard
              title="Crash-free rate"
              value={`${crashFreeRate}%`}
              subtitle={crashDevices > 0 ? `${crashDevices} affected devices` : undefined}
              icon={ShieldCheck}
            />
          </div>

          {/* Charts row */}
          <div className="grid gap-4 lg:grid-cols-2">
            {last30Downloads.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    Downloads over time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={downloadsConfig}
                    className="h-[240px] w-full"
                  >
                    <BarChart data={last30Downloads} accessibilityLayer>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={formatDate}
                        interval="preserveStartEnd"
                      />
                      <YAxis tickLine={false} axisLine={false} width={40} />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelFormatter={(v) => formatDate(v as string)}
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
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {last30Revenue.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    Proceeds over time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={proceedsConfig}
                    className="h-[240px] w-full"
                  >
                    <LineChart data={last30Revenue} accessibilityLayer>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={formatDate}
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
                            labelFormatter={(v) => formatDate(v as string)}
                            formatter={(value) => (
                              <div className="flex flex-1 items-center justify-between gap-2 leading-none">
                                <span className="text-muted-foreground">Proceeds</span>
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
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
