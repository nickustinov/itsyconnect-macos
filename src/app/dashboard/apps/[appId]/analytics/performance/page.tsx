"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Warning } from "@phosphor-icons/react";
import { useAnalytics } from "@/lib/analytics-context";
import { AnalyticsStateGuard } from "@/components/analytics-state-guard";
import { EmptyState } from "@/components/empty-state";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { PerfMetricSeries } from "@/lib/asc/analytics";

// Chart colour palette for dynamic dataset keys
const DATASET_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

// ---------- Helpers ----------

interface MetricGroup {
  key: string;
  label: string;
  unit: string;
  series: PerfMetricSeries[];
}

function groupMetrics(metrics: PerfMetricSeries[]): MetricGroup[] {
  const map = new Map<string, MetricGroup>();
  for (const s of metrics) {
    const key = `${s.category}||${s.platform}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: `${s.category} – ${s.platform}`,
        unit: s.unit,
        series: [],
      });
    }
    map.get(key)!.series.push(s);
  }
  return Array.from(map.values());
}

interface ChartDatum {
  version: string;
  [datasetKey: string]: string | number;
}

interface DatasetEntry {
  /** CSS-safe key used in config and data (e.g. "ds0") */
  key: string;
  /** Human-readable label (e.g. "iPhone – p50") */
  label: string;
  dashed: boolean;
}

function buildChartData(group: MetricGroup): {
  data: ChartDatum[];
  config: ChartConfig;
  datasets: DatasetEntry[];
} {
  // Collect all versions in order
  const versionSet = new Set<string>();
  for (const s of group.series) {
    for (const ds of s.datasets) {
      for (const p of ds.points) versionSet.add(p.version);
    }
  }
  const versions = Array.from(versionSet);

  // Build indexed dataset entries – keys are CSS-safe ("ds0", "ds1", …)
  const config: ChartConfig = {};
  const datasets: DatasetEntry[] = [];
  // Map from "device||percentile" to index key for data lookup
  const keyMap = new Map<string, string>();
  let idx = 0;

  for (const s of group.series) {
    for (const ds of s.datasets) {
      const key = `ds${idx}`;
      const label = `${ds.device} – ${ds.percentile}`;
      const dashed = ds.percentile.toLowerCase().includes("90");
      datasets.push({ key, label, dashed });
      config[key] = {
        label,
        color: DATASET_COLORS[idx % DATASET_COLORS.length],
      };
      keyMap.set(`${ds.device}||${ds.percentile}`, key);
      idx++;
    }
  }

  const data: ChartDatum[] = versions.map((version) => {
    const datum: ChartDatum = { version };
    for (const s of group.series) {
      for (const ds of s.datasets) {
        const key = keyMap.get(`${ds.device}||${ds.percentile}`)!;
        const point = ds.points.find((p) => p.version === version);
        if (point) datum[key] = point.value;
      }
    }
    return datum;
  });

  return { data, config, datasets };
}

// ---------- Page ----------

export default function PerformancePage() {
  const t = useTranslations();
  const { data } = useAnalytics();

  const perfMetrics = data?.perfMetrics ?? [];
  const perfRegressions = data?.perfRegressions ?? [];

  const groups = useMemo(() => groupMetrics(perfMetrics), [perfMetrics]);

  if (perfMetrics.length === 0 && perfRegressions.length === 0) {
    return (
      <AnalyticsStateGuard>
      <EmptyState
        title={t("analytics.noPerformanceTitle")}
        description={t("analytics.noPerformanceDescription")}
      />
      </AnalyticsStateGuard>
    );
  }

  return (
    <AnalyticsStateGuard>
    <div className="space-y-6">
      {/* Regression callout cards */}
      {perfRegressions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {perfRegressions.map((r, i) => (
            <Card key={i} className="border-amber-500/50">
              <CardHeader className="flex-row items-start gap-3">
                <Warning size={20} className="mt-0.5 shrink-0 text-amber-500" />
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium">
                    {r.metric}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {r.latestVersion} – {r.metricCategory}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{r.summary}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Metric charts – one card per category + platform group */}
      {groups.map((group) => (
        <MetricGroupChart key={group.key} group={group} />
      ))}
    </div>
    </AnalyticsStateGuard>
  );
}

// ---------- Metric group chart ----------

function MetricGroupChart({ group }: { group: MetricGroup }) {
  const { data, config, datasets } = useMemo(
    () => buildChartData(group),
    [group],
  );

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {group.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[280px] w-full">
          <LineChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="version"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={45}
              tickFormatter={(v) => `${v}${group.unit}`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <span className="font-mono font-medium tabular-nums">
                      {value}{group.unit}
                    </span>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {datasets.map(({ key, dashed }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                strokeDasharray={dashed ? "5 5" : undefined}
                dot={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
