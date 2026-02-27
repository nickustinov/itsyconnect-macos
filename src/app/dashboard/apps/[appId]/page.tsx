"use client";

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
  Receipt,
  ShieldCheck,
  SpinnerGap,
} from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
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
import {
  DAILY_DOWNLOADS,
  DAILY_SESSIONS,
  CRASHES,
  TERRITORIES,
  formatDate,
} from "@/lib/mock-analytics";
import { DAILY_REVENUE } from "@/lib/mock-sales";

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
  firstTime: { label: "First-time", color: "var(--color-chart-1)" },
  redownload: { label: "Redownload", color: "var(--color-chart-2)" },
  update: { label: "Update", color: "var(--color-chart-3)" },
} satisfies ChartConfig;

const revenueConfig = {
  proceeds: { label: "Proceeds", color: "var(--color-chart-1)" },
  sales: { label: "Customer price", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

const territoryConfig = {
  downloads: { label: "Downloads", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

// ---------- Page ----------

export default function AppOverviewPage() {
  const { appId } = useParams<{ appId: string }>();
  const { apps, loading: appsLoading } = useApps();
  const { versions, loading: versionsLoading } = useVersions();
  const app = apps.find((a) => a.id === appId);

  if (appsLoading || versionsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <SpinnerGap size={24} className="animate-spin text-muted-foreground" />
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
  const downloads = DAILY_DOWNLOADS.slice(-30);
  const revenue = DAILY_REVENUE.slice(-30);

  const totalDownloads = downloads.reduce(
    (s, d) => s + d.firstTime + d.redownload + d.update,
    0,
  );
  const totalFirstTime = downloads.reduce((s, d) => s + d.firstTime, 0);
  const totalProceeds = revenue.reduce((s, d) => s + d.proceeds, 0);
  const totalUnits = revenue.reduce((s, d) => s + d.units, 0);

  const totalDevices = DAILY_SESSIONS.slice(-30).reduce(
    (s, d) => s + d.uniqueDevices,
    0,
  );
  const crashDevices = CRASHES.reduce((s, c) => s + c.uniqueDevices, 0);
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
            className="block"
          >
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {PLATFORM_LABELS[version.attributes.platform] ?? version.attributes.platform}
                </CardTitle>
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${STATE_BADGE_CLASSES[version.attributes.appVersionState] ?? "bg-muted text-muted-foreground border-border"}`}
                >
                  {stateLabel(version.attributes.appVersionState)}
                </span>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono">
                    {version.attributes.versionString}
                  </span>
                  <span
                    className={`size-2 rounded-full ${STATE_DOT_COLORS[version.attributes.appVersionState] ?? "bg-muted-foreground"}`}
                  />
                </div>
                {version.build && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Build {version.build.attributes.version} &middot;{" "}
                    {new Date(version.build.attributes.uploadedDate).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Downloads"
          value={totalDownloads.toLocaleString()}
          subtitle={`${totalFirstTime.toLocaleString()} first-time`}
          icon={DownloadSimple}
        />
        <KpiCard
          title="Proceeds"
          value={`$${totalProceeds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle="Last 30 days"
          icon={CurrencyDollar}
        />
        <KpiCard
          title="Units sold"
          value={totalUnits.toLocaleString()}
          subtitle="Lifetime Pro IAP"
          icon={Receipt}
        />
        <KpiCard
          title="Crash-free rate"
          value={`${crashFreeRate}%`}
          subtitle={`${crashDevices} affected devices`}
          icon={ShieldCheck}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Downloads over time */}
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
              <AreaChart data={downloads} accessibilityLayer>
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
                <Area
                  type="monotone"
                  dataKey="update"
                  stackId="1"
                  fill="var(--color-update)"
                  stroke="var(--color-update)"
                  fillOpacity={0.4}
                />
                <Area
                  type="monotone"
                  dataKey="redownload"
                  stackId="1"
                  fill="var(--color-redownload)"
                  stroke="var(--color-redownload)"
                  fillOpacity={0.4}
                />
                <Area
                  type="monotone"
                  dataKey="firstTime"
                  stackId="1"
                  fill="var(--color-firstTime)"
                  stroke="var(--color-firstTime)"
                  fillOpacity={0.4}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Revenue over time */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Revenue over time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={revenueConfig}
              className="h-[240px] w-full"
            >
              <AreaChart data={revenue} accessibilityLayer>
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
                      formatter={(value, name) => (
                        <div className="flex flex-1 items-center justify-between gap-2 leading-none">
                          <span className="text-muted-foreground">
                            {name === "proceeds" ? "Proceeds" : "Customer price"}
                          </span>
                          <span className="font-mono font-medium tabular-nums">
                            ${(value as number).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  type="monotone"
                  dataKey="sales"
                  fill="var(--color-sales)"
                  stroke="var(--color-sales)"
                  fillOpacity={0.15}
                  strokeDasharray="4 4"
                />
                <Area
                  type="monotone"
                  dataKey="proceeds"
                  fill="var(--color-proceeds)"
                  stroke="var(--color-proceeds)"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top territories */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Top territories by downloads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={territoryConfig}
            className="h-[320px] w-full"
          >
            <BarChart
              data={TERRITORIES}
              layout="vertical"
              accessibilityLayer
            >
              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="territory"
                type="category"
                tickLine={false}
                axisLine={false}
                width={100}
                className="text-xs"
              />
              <XAxis type="number" tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="downloads"
                fill="var(--color-downloads)"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
