"use client";

import { ChartBar } from "@phosphor-icons/react";
import { useTranslations } from "@/lib/i18n/locale-context";

interface ReportInitiatedBannerProps {
  initiatedAt: number | null;
}

export function ReportInitiatedBanner({ initiatedAt }: ReportInitiatedBannerProps) {
  const t = useTranslations();

  function formatElapsed(at: number | null): string {
    if (!at) return "";
    const hours = Math.floor((Date.now() - at) / (60 * 60 * 1000));
    if (hours < 1) return t("dashboard.requestedJustNow");
    if (hours === 1) return t("dashboard.requestedOneHourAgo");
    if (hours < 24) return t("dashboard.requestedHoursAgo", { hours });
    const days = Math.floor(hours / 24);
    return days === 1
      ? t("dashboard.requestedOneDayAgo")
      : t("dashboard.requestedDaysAgo", { days });
  }

  return (
    <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
          <ChartBar size={18} weight="duotone" className="text-blue-600 dark:text-blue-400" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("dashboard.analyticsGenerating")}</p>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.analyticsGeneratingHint")}
          </p>
          {initiatedAt && (
            <p className="text-xs text-muted-foreground/70">
              {formatElapsed(initiatedAt)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
