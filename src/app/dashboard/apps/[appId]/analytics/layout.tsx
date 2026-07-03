"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useParams,
  usePathname,
  useSearchParams,
} from "next/navigation";
import { BookmarkSimple } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { AnalyticsProvider } from "@/lib/analytics-context";
import { AnalyticsRangePicker } from "@/components/analytics-range-picker";
import { Button } from "@/components/ui/button";
import { MarkersDialog } from "@/components/markers-dialog";
import { useAppMarkers } from "@/lib/hooks/use-app-markers";
import { useTranslations } from "@/lib/i18n/locale-context";

const TAB_KEYS = [
  { key: "analytics.tabs.overview" as const, segment: "" },
  { key: "analytics.tabs.acquisition" as const, segment: "/acquisition" },
  { key: "analytics.tabs.usage" as const, segment: "/usage" },
  { key: "analytics.tabs.crashes" as const, segment: "/crashes" },
  { key: "analytics.tabs.performance" as const, segment: "/performance" },
];

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const { appId } = useParams<{ appId: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [markersOpen, setMarkersOpen] = useState(false);
  const { markers } = useAppMarkers(appId);
  const base = `/dashboard/apps/${appId}/analytics`;
  const range = searchParams.get("range") || "30d";

  function buildHref(segment: string) {
    return `${base}${segment}${range !== "30d" ? `?range=${range}` : ""}`;
  }

  // Derive current segment so tab links preserve the range param
  const currentSegment =
    TAB_KEYS.find((tab) =>
      tab.segment === ""
        ? pathname === base
        : pathname.startsWith(`${base}${tab.segment}`),
    )?.segment ?? "";

  // Crashes = monthly aggregate, Performance = per-version – no range picker for either
  const showRangePicker = currentSegment !== "/crashes" && currentSegment !== "/performance";

  return (
    <AnalyticsProvider appId={appId}>
      <div className="flex flex-1 flex-col gap-6">
        <div className="flex items-center justify-between border-b">
          <nav className="-mb-px flex">
            {TAB_KEYS.map((tab) => {
              const href = buildHref(tab.segment);
              const active =
                tab.segment === ""
                  ? pathname === base
                  : pathname.startsWith(`${base}${tab.segment}`);
              return (
                <Link
                  key={tab.segment}
                  href={href}
                  className={cn(
                    "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(tab.key)}
                </Link>
              );
            })}
          </nav>
          <div className="mb-1 flex items-center gap-2">
            {showRangePicker && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMarkersOpen(true)}
              >
                <BookmarkSimple className="size-4" />
                {t("analytics.markers")}
                {markers.length > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    {markers.length}
                  </span>
                )}
              </Button>
            )}
            {showRangePicker && <AnalyticsRangePicker />}
          </div>
        </div>
        <MarkersDialog appId={appId} open={markersOpen} onOpenChange={setMarkersOpen} />
        {children}
      </div>
    </AnalyticsProvider>
  );
}
