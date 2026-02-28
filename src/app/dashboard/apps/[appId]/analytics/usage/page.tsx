"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
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
import { formatDate } from "@/lib/mock-analytics";
import { useAnalytics } from "@/lib/analytics-context";
import { parseRange, filterByDateRange } from "@/lib/analytics-range";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

// ---------- Chart configs ----------

const sessionsConfig = {
  sessions: { label: "Sessions", color: "var(--color-chart-1)" },
  uniqueDevices: { label: "Active devices", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

const durationConfig = {
  avgDuration: { label: "Avg duration (s)", color: "var(--color-chart-3)" },
} satisfies ChartConfig;

const installDeleteConfig = {
  installs: { label: "Installations", color: "var(--color-chart-1)" },
  deletes: { label: "Deletions", color: "var(--color-chart-5)" },
} satisfies ChartConfig;

const optInConfig = {
  downloading: { label: "Downloading users", color: "var(--color-chart-2)" },
  optingIn: { label: "Users opting in", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

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
  const searchParams = useSearchParams();
  const range = useMemo(() => parseRange(searchParams.get("range")), [searchParams]);
  const { data, loading, error, pending } = useAnalytics();

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
        label: key.startsWith("v") ? `v${key.slice(1).replace(/(\d)(?=\d)/g, "$1.")}` : key,
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

  if (loading && !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (pending) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Spinner className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Fetching analytics data – this may take a moment on first load
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Row 1: Sessions + duration */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sessions and unique devices */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Sessions and active devices
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
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Average session duration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Average session duration
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
                  tickFormatter={formatDate}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={35}
                  tickFormatter={(v) => `${v}s`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => formatDate(v as string)}
                      formatter={(value) => (
                        <span className="font-mono font-medium tabular-nums">
                          {value}s
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
              Sessions by app version
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
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Row 3: Installs vs deletes + opt-in */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Installs vs deletes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Installations and deletions
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
                  tickFormatter={formatDate}
                  interval="preserveStartEnd"
                />
                <YAxis tickLine={false} axisLine={false} width={30} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => formatDate(v as string)}
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
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Opt-in rate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Analytics opt-in
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">
                {optInRate}%
              </span>
              <span className="text-sm text-muted-foreground">opt-in rate</span>
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
                  tickFormatter={formatDate}
                  interval="preserveStartEnd"
                />
                <YAxis tickLine={false} axisLine={false} width={30} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => formatDate(v as string)}
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
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
