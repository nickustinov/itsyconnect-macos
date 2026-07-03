"use client";

import { usePathname } from "next/navigation";
import { MagicWand } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useInsightsPanel } from "@/lib/insights-panel-context";
import { useTranslations } from "@/lib/i18n/locale-context";

export function HeaderInsightsButton() {
  const t = useTranslations();
  const pathname = usePathname();
  const { open, toggle } = useInsightsPanel();

  // Only show on per-app reviews and analytics pages (not the cross-app review center)
  if (!/\/apps\/[^/]+\/reviews$/.test(pathname) && !pathname.match(/\/analytics(\/|$)/)) return null;

  return (
    <Button
      variant={open ? "secondary" : "ghost"}
      size="sm"
      onClick={toggle}
    >
      <MagicWand size={14} className="mr-1.5" />
      {t("insights.title")}
    </Button>
  );
}
