"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAppMarkers } from "@/lib/hooks/use-app-markers";
import { renderMarkers } from "@/components/chart-markers";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDateShort, formatDuration, formatVersionSessionLabel } from "@/lib/format";
import { useAnalytics } from "@/lib/analytics-context";
import { parseRange, filterByDateRange, getStoredRange } from "@/lib/analytics-range";
import { AnalyticsStateGuard } from "@/components/analytics-state-guard";
import { useAnalyticsLabels } from "@/lib/i18n/use-analytics-labels";

// Chart colour palette for dynamic version keys
const VERSION_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

// ---------- Page ----------

export default function UsagePage() {
  const {
    sessionsConfig,
    durationConfig,
    installDeleteConfig,
    optInConfig,
    t,
  } = useAnalyticsLabels();
  const searchParams = useSearchParams();
  const { appId } = useParams<{ appId: string }>();
  const { markers } = useAppMarkers(appId);
  const { data, lastDate } = useAnalytics();
  const range = useMemo(() => parseRange(searchParams.get("range") ?? getStoredRange(), lastDate), [searchParams, lastDate]);

  const sessions = useMemo(
    () => filterByDateRange(data?.dailySessions ?? [], range),
    [data, range],
  );
  const versionSessions = useMemo(
    () => filterByDateRange(data?.dailyVersionSessions ?? [] as Array<{ date: string } & Record<string, number>>, range),
    [data, range],
  );
  const installsDeletes = useMemo(
    () => filterByDateRange(data?.dailyInstallsDeletes ?? [], range),
    [data, range],
  );
  const optIn = useMemo(
    () => filterByDateRange(data?.dailyOptIn ?? [], range),
    [data, range],
  );

  // Build dynamic version config from actual data keys
  const versionKeys = useMemo(() => {
    if (versionSessions.length === 0) return [];
    const keys = new Set<string>();
    for (const entry of versionSessions) {
      for (const key of Object.keys(entry)) {
        if (key !== "date") keys.add(key);
      }
    }
    return Array.from(keys).sort();
  }, [versionSessions]);

  const versionConfig = useMemo(() => {
    const config: ChartConfig = {};
    for (let i = 0; i < versionKeys.length; i++) {
      const key = versionKeys[i];
      config[key] = {
        label: formatVersionSessionLabel(key),
        color: VERSION_COLORS[i % VERSION_COLORS.length],
      };
    }
    return config;
  }, [versionKeys]);

  // Opt-in rate
  const totalDownloading = optIn.reduce((s, d) => s + d.downloading, 0);
  const totalOptingIn = optIn.reduce((s, d) => s + d.optingIn, 0);
  const optInRate =
    totalDownloading > 0
      ? ((totalOptingIn / totalDownloading) * 100).toFixed(1)
      : "0";

  return (
    <AnalyticsStateGuard>
    <div className="space-y-6">
      {/* Row 1: Sessions + duration */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sessions and unique devices */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t("analytics.sessionsAndDevices")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={sessionsConfig}
              className="h-[280px] w-full"
            >
              <LineChart data={sessions} accessibilityLayer>
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
                <Line
                  type="monotone"
                  dataKey="sessions"
                  stroke="var(--color-sessions)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="uniqueDevices"
                  stroke="var(--color-uniqueDevices)"
                  strokeWidth={2}
                  dot={false}
                />
                {renderMarkers({
                  markers,
                  visibleDates: sessions.map((d) => d.date),
                })}
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Average session duration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t("analytics.avgSessionDuration")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={durationConfig}
              className="h-[280px] w-full"
            >
              <AreaChart data={sessions} accessibilityLayer>
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
                  width={45}
                  tickFormatter={(v) => formatDuration(v as number, true)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => formatDateShort(v as string)}
                      formatter={(value) => (
                        <span className="font-mono font-medium tabular-nums">
                          {formatDuration(value as number)}
                        </span>
                      )}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="avgDuration"
                  fill="var(--color-avgDuration)"
                  stroke="var(--color-avgDuration)"
                  fillOpacity={0.3}
                />
                {renderMarkers({
                  markers,
                  visibleDates: sessions.map((d) => d.date),
                })}
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Version adoption */}
      {versionKeys.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t("analytics.sessionsByVersion")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={versionConfig}
              className="h-[280px] w-full"
            >
              <AreaChart data={versionSessions} accessibilityLayer>
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
                {versionKeys.map((key) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stackId="1"
                    fill={`var(--color-${key})`}
                    stroke={`var(--color-${key})`}
                    fillOpacity={0.4}
                  />
                ))}
                {renderMarkers({
                  markers,
                  visibleDates: versionSessions.map((d) => d.date),
                })}
              </AreaChart>
            </ChartContainer>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 pt-3">
              {versionKeys.map((key) => (
                <div key={key} className="flex items-center gap-1.5 text-xs">
                  <div
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: versionConfig[key]?.color }}
                  />
                  <span>{versionConfig[key]?.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Row 3: Installs vs deletes + opt-in */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Installs vs deletes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t("analytics.installationsAndDeletions")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={installDeleteConfig}
              className="h-[240px] w-full"
            >
              <BarChart data={installsDeletes} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={formatDateShort}
                  interval="preserveStartEnd"
                />
                <YAxis tickLine={false} axisLine={false} width={30} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => formatDateShort(v as string)}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  dataKey="installs"
                  fill="var(--color-installs)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="deletes"
                  fill="var(--color-deletes)"
                  radius={[4, 4, 0, 0]}
                />
                {renderMarkers({
                  markers,
                  visibleDates: installsDeletes.map((d) => d.date),
                })}
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Opt-in rate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t("analytics.analyticsOptIn")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">
                {optInRate}%
              </span>
              <span className="text-sm text-muted-foreground">{t("analytics.optInRate")}</span>
            </div>
            <ChartContainer
              config={optInConfig}
              className="h-[192px] w-full"
            >
              <BarChart data={optIn} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={formatDateShort}
                  interval="preserveStartEnd"
                />
                <YAxis tickLine={false} axisLine={false} width={30} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => formatDateShort(v as string)}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  dataKey="downloading"
                  fill="var(--color-downloading)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="optingIn"
                  fill="var(--color-optingIn)"
                  radius={[4, 4, 0, 0]}
                />
                {renderMarkers({
                  markers,
                  visibleDates: optIn.map((d) => d.date),
                })}
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
    </AnalyticsStateGuard>
  );
}
