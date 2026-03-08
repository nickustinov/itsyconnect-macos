"use client";

import { usePathname } from "next/navigation";
import { MagicWand } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useInsightsPanel } from "@/lib/insights-panel-context";

export function HeaderInsightsButton() {
  const pathname = usePathname();
  const { open, toggle } = useInsightsPanel();

  // Only show on reviews and analytics pages
  if (!pathname.match(/\/reviews$/) && !pathname.match(/\/analytics(\/|$)/)) return null;

  return (
    <Button
      variant={open ? "secondary" : "ghost"}
      size="sm"
      onClick={toggle}
    >
      <MagicWand size={14} className="mr-1.5" />
      Insights
    </Button>
  );
}
