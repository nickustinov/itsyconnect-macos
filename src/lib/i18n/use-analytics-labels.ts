"use client";

import { useMemo } from "react";
import type { ChartConfig } from "@/components/ui/chart";
import { useTranslations } from "./locale-context";

/** Translated analytics chart configs, KPI labels, and section titles. */
export function useAnalyticsLabels() {
  const t = useTranslations();

  const downloadsConfig = useMemo(
    (): ChartConfig => ({
      firstTime: { label: t("analytics.firstTimeDownloads"), color: "var(--color-chart-1)" },
      redownload: { label: t("analytics.redownloads"), color: "var(--color-chart-2)" },
      update: { label: t("analytics.updates"), color: "var(--color-chart-3)" },
    }),
    [t],
  );

  const revenueConfig = useMemo(
    (): ChartConfig => ({
      proceeds: { label: t("analytics.proceeds"), color: "var(--color-chart-1)" },
      sales: { label: t("analytics.sales"), color: "var(--color-chart-2)" },
    }),
    [t],
  );

  const territoryConfig = useMemo(
    (): ChartConfig => ({
      downloads: { label: t("analytics.totalDownloads"), color: "var(--color-chart-1)" },
    }),
    [t],
  );

  const funnelConfig = useMemo(
    (): ChartConfig => ({
      impressions: { label: t("analytics.impressions"), color: "var(--color-chart-3)" },
      pageViews: { label: t("analytics.pageViews"), color: "var(--color-chart-2)" },
      downloads: { label: t("analytics.firstTimeDownloads"), color: "var(--color-chart-1)" },
    }),
    [t],
  );

  const sourceConfig = useMemo(
    (): ChartConfig => ({
      search: { label: t("analytics.appStoreSearch"), color: "var(--color-chart-1)" },
      browse: { label: t("analytics.appStoreBrowse"), color: "var(--color-chart-2)" },
      webReferrer: { label: t("analytics.webReferrer"), color: "var(--color-chart-3)" },
      unavailable: { label: t("analytics.unavailable"), color: "var(--color-chart-4)" },
      count: { label: t("analytics.totalDownloads") },
    }),
    [t],
  );

  const engagementConfig = useMemo(
    (): ChartConfig => ({
      impressions: { label: t("analytics.impressions"), color: "var(--color-chart-1)" },
      pageViews: { label: t("analytics.pageViews"), color: "var(--color-chart-2)" },
    }),
    [t],
  );

  const downloadSourceConfig = useMemo(
    (): ChartConfig => ({
      search: { label: t("analytics.search"), color: "var(--color-chart-1)" },
      browse: { label: t("analytics.browse"), color: "var(--color-chart-2)" },
      webReferrer: { label: t("analytics.webReferrer"), color: "var(--color-chart-3)" },
      unavailable: { label: t("analytics.unavailable"), color: "var(--color-chart-4)" },
    }),
    [t],
  );

  const webPreviewConfig = useMemo(
    (): ChartConfig => ({
      pageViews: { label: t("analytics.pageViews"), color: "var(--color-chart-1)" },
      appStoreTaps: { label: t("analytics.appStoreTaps"), color: "var(--color-chart-2)" },
    }),
    [t],
  );

  const sessionsConfig = useMemo(
    (): ChartConfig => ({
      sessions: { label: t("analytics.sessions"), color: "var(--color-chart-1)" },
      uniqueDevices: { label: t("analytics.activeDevices"), color: "var(--color-chart-2)" },
    }),
    [t],
  );

  const durationConfig = useMemo(
    (): ChartConfig => ({
      avgDuration: { label: t("analytics.avgDuration"), color: "var(--color-chart-3)" },
    }),
    [t],
  );

  const installDeleteConfig = useMemo(
    (): ChartConfig => ({
      installs: { label: t("analytics.installations"), color: "var(--color-chart-1)" },
      deletes: { label: t("analytics.deletions"), color: "var(--color-chart-5)" },
    }),
    [t],
  );

  const optInConfig = useMemo(
    (): ChartConfig => ({
      downloading: { label: t("analytics.downloadingUsers"), color: "var(--color-chart-2)" },
      optingIn: { label: t("analytics.usersOptingIn"), color: "var(--color-chart-1)" },
    }),
    [t],
  );

  return {
    downloadsConfig,
    revenueConfig,
    territoryConfig,
    funnelConfig,
    sourceConfig,
    engagementConfig,
    downloadSourceConfig,
    webPreviewConfig,
    sessionsConfig,
    durationConfig,
    installDeleteConfig,
    optInConfig,
    t,
  };
}
