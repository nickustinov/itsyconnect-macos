"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
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
  CurrencyDollar,
  Receipt,
  ArrowsClockwise,
  TrendUp,
} from "@phosphor-icons/react";
import {
  DAILY_REVENUE,
  REVENUE_BY_TERRITORY,
  formatDate,
} from "@/lib/mock-sales";
import { KpiCard } from "@/components/kpi-card";

// ---------- Chart configs ----------

const revenueConfig = {
  proceeds: { label: "Proceeds", color: "var(--color-chart-1)" },
  sales: { label: "Customer price", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

const territoryConfig = {
  proceeds: { label: "Proceeds (USD)", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

// ---------- Page ----------

export default function SalesOverviewPage() {
  const searchParams = useSearchParams();
  const days = searchParams.get("range") === "7d" ? 7 : 30;

  const revenue = useMemo(() => DAILY_REVENUE.slice(-days), [days]);

  const totalProceeds = revenue.reduce((s, d) => s + d.proceeds, 0);
  const totalSales = revenue.reduce((s, d) => s + d.sales, 0);
  const totalUnits = revenue.reduce((s, d) => s + d.units, 0);
  const totalRefunds = revenue.reduce((s, d) => s + d.refunds, 0);
  const avgPerUnit = totalUnits > 0 ? totalProceeds / totalUnits : 0;
  const refundRate =
    totalUnits > 0 ? ((totalRefunds / totalUnits) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Proceeds"
          value={`$${totalProceeds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle={`$${totalSales.toLocaleString()} gross sales`}
          icon={CurrencyDollar}
        />
        <KpiCard
          title="Units sold"
          value={totalUnits.toLocaleString()}
          subtitle="Lifetime Pro IAP"
          icon={Receipt}
        />
        <KpiCard
          title="Avg. per unit"
          value={`$${avgPerUnit.toFixed(2)}`}
          subtitle="Developer proceeds"
          icon={TrendUp}
        />
        <KpiCard
          title="Refund rate"
          value={`${refundRate}%`}
          subtitle={`${totalRefunds} refund${totalRefunds !== 1 ? "s" : ""} this period`}
          icon={ArrowsClockwise}
        />
      </div>

      {/* Revenue over time */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Revenue over time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={revenueConfig} className="h-[300px] w-full">
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

      {/* Revenue by territory */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Revenue by territory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={territoryConfig}
            className="h-[380px] w-full"
          >
            <BarChart
              data={REVENUE_BY_TERRITORY}
              layout="vertical"
              accessibilityLayer
            >
              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="territory"
                type="category"
                tickLine={false}
                axisLine={false}
                width={110}
                className="text-xs"
              />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => (
                      <span className="font-mono font-medium tabular-nums">
                        ${(value as number).toLocaleString()}
                      </span>
                    )}
                  />
                }
              />
              <Bar
                dataKey="proceeds"
                fill="var(--color-proceeds)"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
