"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bug,
  DeviceMobile,
  Desktop,
} from "@phosphor-icons/react";
import { useAnalytics } from "@/lib/analytics-context";
import { KpiCard } from "@/components/kpi-card";
import { AnalyticsStateGuard } from "@/components/analytics-state-guard";
import { useTranslations } from "@/lib/i18n/locale-context";

// ---------- Page ----------

export default function CrashesPage() {
  const t = useTranslations();
  const { data } = useAnalytics();

  const crashesByVersion = data?.crashesByVersion ?? [];
  const crashesByDevice = data?.crashesByDevice ?? [];

  const totalCrashes = crashesByVersion.reduce((s, c) => s + c.crashes, 0);
  const totalAffected = crashesByVersion.reduce((s, c) => s + c.uniqueDevices, 0);

  return (
    <AnalyticsStateGuard>
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          title={t("analytics.totalCrashes")}
          value={totalCrashes.toLocaleString()}
          subtitle={crashesByVersion.length === 1
            ? t("analytics.acrossVersions", { count: crashesByVersion.length })
            : t("analytics.acrossVersionsPlural", { count: crashesByVersion.length })}
          icon={Bug}
        />
        <KpiCard
          title={t("analytics.affectedDevices")}
          value={totalAffected.toLocaleString()}
          subtitle={t("analytics.uniqueDevicesWithCrashes")}
          icon={DeviceMobile}
        />
        <KpiCard
          title={t("analytics.deviceModels")}
          value={crashesByDevice.length.toLocaleString()}
          subtitle={t("analytics.distinctModelsAffected")}
          icon={Desktop}
        />
      </div>

      {/* Two tables side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Crashes by version */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t("analytics.crashesByVersion")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("analytics.version")}</TableHead>
                  <TableHead>{t("analytics.platform")}</TableHead>
                  <TableHead className="text-right">{t("analytics.crashes")}</TableHead>
                  <TableHead className="text-right">{t("analytics.uniqueDevices")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crashesByVersion.map((row) => (
                  <TableRow key={`${row.version}-${row.platform}`}>
                    <TableCell className="font-medium font-mono">
                      {row.version}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.platform}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.crashes}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.uniqueDevices}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Crashes by device */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t("analytics.crashesByDevice")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("analytics.device")}</TableHead>
                  <TableHead className="text-right">{t("analytics.crashes")}</TableHead>
                  <TableHead className="text-right">{t("analytics.uniqueDevices")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crashesByDevice.map((row) => (
                  <TableRow key={row.device}>
                    <TableCell className="font-medium font-mono">
                      {row.device}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.crashes}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.uniqueDevices}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
    </AnalyticsStateGuard>
  );
}
