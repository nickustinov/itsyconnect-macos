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
import {
  DownloadSimple,
  CurrencyDollar,
  Timer,
  ShieldCheck,
} from "@phosphor-icons/react";
import {
  DAILY_DOWNLOADS,
  DAILY_REVENUE,
  DAILY_ENGAGEMENT,
  DAILY_SESSIONS,
  TERRITORIES,
  CRASHES,
  formatDate,
} from "@/lib/mock-analytics";
import { KpiCard } from "@/components/kpi-card";

// ---------- Chart configs ----------

const downloadsConfig = {
  firstTime: { label: "First-time", color: "var(--color-chart-1)" },
  redownload: { label: "Redownload", color: "var(--color-chart-2)" },
  update: { label: "Update", color: "var(--color-chart-3)" },
} satisfies ChartConfig;

const revenueConfig = {
  proceeds: { label: "Proceeds", color: "var(--color-chart-1)" },
  sales: { label: "Sales", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

const territoryConfig = {
  downloads: { label: "Downloads", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

const funnelConfig = {
  impressions: { label: "Impressions", color: "var(--color-chart-3)" },
  pageViews: { label: "Page views", color: "var(--color-chart-2)" },
  downloads: { label: "Downloads", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

// ---------- Helpers ----------

function pctChange(current: number, previous: number): string {
  if (previous === 0) return "+0%";
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

// ---------- Page ----------

export default function AnalyticsOverviewPage() {
  const searchParams = useSearchParams();
  const days = searchParams.get("range") === "7d" ? 7 : 30;

  const downloads = useMemo(() => DAILY_DOWNLOADS.slice(-days), [days]);
  const revenue = useMemo(() => DAILY_REVENUE.slice(-days), [days]);

  const totalDownloads = downloads.reduce(
    (s, d) => s + d.firstTime + d.redownload + d.update,
    0,
  );
  const prevDownloads = DAILY_DOWNLOADS.slice(-(days * 2), -days).reduce(
    (s, d) => s + d.firstTime + d.redownload + d.update,
    0,
  );

  const totalRevenue = revenue.reduce((s, d) => s + d.proceeds, 0);
  const prevRevenue = DAILY_REVENUE.slice(-(days * 2), -days).reduce(
    (s, d) => s + d.proceeds,
    0,
  );

  const totalFirstTime = downloads.reduce((s, d) => s + d.firstTime, 0);

  const sessionSlice = DAILY_SESSIONS.slice(-days);
  const totalDevices = sessionSlice.reduce((s, d) => s + d.uniqueDevices, 0);
  const crashDevices = CRASHES.reduce((s, c) => s + c.uniqueDevices, 0);
  const crashFreeRate =
    totalDevices > 0
      ? ((1 - crashDevices / totalDevices) * 100).toFixed(1)
      : "100";

  const engagement = DAILY_ENGAGEMENT.slice(-days);
  const totalImpressions = engagement.reduce((s, d) => s + d.impressions, 0);
  const totalPageViews = engagement.reduce((s, d) => s + d.pageViews, 0);

  const funnelData = [
    { stage: "impressions", value: totalImpressions },
    { stage: "pageViews", value: totalPageViews },
    { stage: "downloads", value: totalFirstTime },
  ];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Downloads"
          value={totalDownloads.toLocaleString()}
          subtitle={`${pctChange(totalDownloads, prevDownloads)} from previous period`}
          icon={DownloadSimple}
        />
        <KpiCard
          title="Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          subtitle={`${pctChange(totalRevenue, prevRevenue)} from previous period`}
          icon={CurrencyDollar}
        />
        <KpiCard
          title="First-time downloads"
          value={totalFirstTime.toLocaleString()}
          subtitle={`${pctChange(
            totalFirstTime,
            DAILY_DOWNLOADS.slice(-(days * 2), -days).reduce(
              (s, d) => s + d.firstTime,
              0,
            ),
          )} from previous period`}
          icon={Timer}
        />
        <KpiCard
          title="Crash-free rate"
          value={`${crashFreeRate}%`}
          subtitle={`${crashDevices} affected devices from previous period`}
          icon={ShieldCheck}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Downloads over time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={downloadsConfig}
              className="h-[280px] w-full"
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

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Revenue over time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={revenueConfig}
              className="h-[280px] w-full"
            >
              <LineChart data={revenue} accessibilityLayer>
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
                            {name === "proceeds" ? "Proceeds" : "Sales"}
                          </span>
                          <span className="font-mono font-medium tabular-nums">
                            ${(value as number).toLocaleString()}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  type="monotone"
                  dataKey="proceeds"
                  stroke="var(--color-proceeds)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="var(--color-sales)"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="4 4"
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Top territories
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

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Conversion funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={funnelConfig}
              className="h-[320px] w-full"
            >
              <BarChart data={funnelData} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="stage"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) =>
                    funnelConfig[v as keyof typeof funnelConfig]?.label ?? v
                  }
                />
                <YAxis tickLine={false} axisLine={false} width={60} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      nameKey="stage"
                      labelFormatter={(v) =>
                        funnelConfig[v as keyof typeof funnelConfig]?.label ?? v
                      }
                    />
                  }
                />
                <Bar
                  dataKey="value"
                  radius={[4, 4, 0, 0]}
                  fill="var(--color-chart-1)"
                />
              </BarChart>
            </ChartContainer>
            <div className="mt-3 flex items-center justify-center gap-6 text-xs text-muted-foreground">
              <span>
                Page view rate:{" "}
                <strong className="text-foreground">
                  {((totalPageViews / totalImpressions) * 100).toFixed(1)}%
                </strong>
              </span>
              <span>
                Download rate:{" "}
                <strong className="text-foreground">
                  {((totalFirstTime / totalPageViews) * 100).toFixed(1)}%
                </strong>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
