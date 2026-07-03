"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAppMarkers } from "@/lib/hooks/use-app-markers";
import { renderMarkers } from "@/components/chart-markers";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
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
} from "@/components/ui/chart";
import { formatDateShort } from "@/lib/format";
import { useAnalytics } from "@/lib/analytics-context";
import { parseRange, filterByDateRange, getStoredRange } from "@/lib/analytics-range";
import { AnalyticsStateGuard } from "@/components/analytics-state-guard";
import { useAnalyticsLabels } from "@/lib/i18n/use-analytics-labels";

// ---------- Fill colours for discovery sources ----------

const SOURCE_FILLS: Record<string, string> = {
  search: "var(--color-search)",
  browse: "var(--color-browse)",
  webReferrer: "var(--color-webReferrer)",
  unavailable: "var(--color-unavailable)",
};

// ---------- Page ----------

export default function AcquisitionPage() {
  const {
    sourceConfig,
    engagementConfig,
    downloadSourceConfig,
    webPreviewConfig,
    t,
  } = useAnalyticsLabels();
  const searchParams = useSearchParams();
  const { appId } = useParams<{ appId: string }>();
  const { markers } = useAppMarkers(appId);
  const { data, lastDate } = useAnalytics();
  const range = useMemo(() => parseRange(searchParams.get("range") ?? getStoredRange(), lastDate), [searchParams, lastDate]);

  const engagement = useMemo(
    () => filterByDateRange(data?.dailyEngagement ?? [], range),
    [data, range],
  );
  const downloadsBySource = useMemo(
    () => filterByDateRange(data?.dailyDownloadsBySource ?? [], range),
    [data, range],
  );
  const webPreview = useMemo(
    () => filterByDateRange(data?.dailyWebPreview ?? [], range),
    [data, range],
  );

  // Add fill property client-side if not present
  const discoverySources = useMemo(
    () =>
      (data?.discoverySources ?? []).map((s) => ({
        ...s,
        fill: s.fill || SOURCE_FILLS[s.source] || "var(--color-chart-1)",
      })),
    [data],
  );

  const totalSources = discoverySources.reduce((s, d) => s + d.count, 0);

  return (
    <AnalyticsStateGuard>
    <div className="space-y-6">
      {/* Row 1: Source pie + engagement lines */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Discovery sources */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t("analytics.discoverySources")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={sourceConfig}
              className="mx-auto h-[280px] w-full"
            >
              <PieChart accessibilityLayer>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      nameKey="source"
                      hideLabel
                      formatter={(value, _name, item) => {
                        const key = item.payload?.source as string;
                        const label = sourceConfig[key as keyof typeof sourceConfig]?.label ?? key;
                        return (
                          <div className="flex flex-1 items-center justify-between gap-2 leading-none">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-mono font-medium tabular-nums">
                              {(value as number).toLocaleString()} (
                              {totalSources > 0
                                ? (((value as number) / totalSources) * 100).toFixed(1)
                                : "0"}
                              %)
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Pie
                  data={discoverySources}
                  dataKey="count"
                  nameKey="source"
                  innerRadius={60}
                  outerRadius={100}
                  strokeWidth={2}
                >
                  {discoverySources.map((entry) => (
                    <Cell key={entry.source} fill={entry.fill} />
                  ))}
                </Pie>
                <ChartLegend content={<ChartLegendContent nameKey="source" />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Impressions vs page views */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t("analytics.impressionsAndPageViews")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={engagementConfig}
              className="h-[280px] w-full"
            >
              <LineChart data={engagement} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={formatDateShort}
                  interval="preserveStartEnd"
                />
                <YAxis tickLine={false} axisLine={false} width={50} />
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
                  dataKey="impressions"
                  stroke="var(--color-impressions)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="pageViews"
                  stroke="var(--color-pageViews)"
                  strokeWidth={2}
                  dot={false}
                />
                {renderMarkers({
                  markers,
                  visibleDates: engagement.map((d) => d.date),
                })}
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Downloads by source */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            {t("analytics.downloadsBySource")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={downloadSourceConfig}
            className="h-[280px] w-full"
          >
            <BarChart data={downloadsBySource} accessibilityLayer>
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
                dataKey="search"
                stackId="1"
                fill="var(--color-search)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="browse"
                stackId="1"
                fill="var(--color-browse)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="webReferrer"
                stackId="1"
                fill="var(--color-webReferrer)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="unavailable"
                stackId="1"
                fill="var(--color-unavailable)"
                radius={[4, 4, 0, 0]}
              />
              {renderMarkers({
                markers,
                visibleDates: downloadsBySource.map((d) => d.date),
              })}
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Row 3: Web preview engagement */}
      <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t("analytics.webPreviewEngagement")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={webPreviewConfig}
              className="h-[280px] w-full"
            >
              <BarChart data={webPreview} accessibilityLayer>
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
                  dataKey="pageViews"
                  fill="var(--color-pageViews)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="appStoreTaps"
                  fill="var(--color-appStoreTaps)"
                  radius={[4, 4, 0, 0]}
                />
                {renderMarkers({
                  markers,
                  visibleDates: webPreview.map((d) => d.date),
                })}
              </BarChart>
            </ChartContainer>
          </CardContent>
      </Card>

    </div>
    </AnalyticsStateGuard>
  );
}
