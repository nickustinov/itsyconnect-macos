"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Package, SquaresFour } from "@phosphor-icons/react";
import { getLastAppId } from "@/lib/nav-state";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useLicense } from "@/lib/license-context";
import { IS_MAS } from "@/lib/license-shared";
import { useFormDirty } from "@/lib/form-dirty-context";
import { AppSwitcher } from "./app-switcher";
import { NavMain } from "./nav-main";
import { NavFooter } from "./nav-footer";
import { useUnreadReviewsPoller } from "@/lib/hooks/use-unread-reviews";
import { useApps } from "@/lib/apps-context";

function ProBanner() {
  const router = useRouter();
  const { isPro, loading } = useLicense();
  const { open } = useSidebar();

  if (loading || isPro) return null;

  return (
    <div
      onClick={() => router.push("/settings/license")}
      className="cursor-pointer rounded-lg bg-blue-500/10 px-3 py-2.5 transition-colors hover:bg-blue-500/15"
    >
      {open ? (
        <div className="flex items-center gap-2.5">
          <Package size={16} weight="duotone" className="shrink-0 text-blue-500" />
          <div className="grid leading-tight">
            <span className="truncate text-xs font-medium text-blue-600 dark:text-blue-400">{IS_MAS ? "Upgrade to Pro" : "Get Pro"}</span>
            <span className="truncate text-[11px] text-blue-500/70">
              Unlimited apps &amp; teams
            </span>
          </div>
        </div>
      ) : (
        <Package size={16} weight="duotone" className="mx-auto text-blue-500" />
      )}
    </div>
  );
}

function PortfolioButton() {
  const pathname = usePathname();
  const router = useRouter();
  const { isDirty, guardNavigation } = useFormDirty();
  const isActive = pathname === "/dashboard";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip="Portfolio" isActive={isActive}>
          <Link
            href="/dashboard"
            onNavigate={(e) => {
              if (!isDirty) return;
              e.preventDefault();
              guardNavigation(() => router.push("/dashboard"));
            }}
          >
            <SquaresFour size={16} />
            <span>Portfolio</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebar() {
  const { appId } = useParams<{ appId?: string }>();
  const { apps } = useApps();
  const [lastAppId, setLastAppId] = useState<string>();
  useEffect(() => {
    if (!appId) setLastAppId(getLastAppId());
  }, [appId]);
  const navAppId = appId ?? lastAppId;

  // Poll review counts for all apps to track unread state
  const appIds = useMemo(() => apps.map((a) => a.id), [apps]);
  useUnreadReviewsPoller(appIds);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="drag pt-8">
        <div className="no-drag">
          <AppSwitcher />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navAppId && <NavMain appId={navAppId} />}
      </SidebarContent>
      <div className="no-drag px-2 pb-2">
        <ProBanner />
      </div>
      <SidebarFooter>
        <PortfolioButton />
        <NavFooter />
      </SidebarFooter>
    </Sidebar>
  );
}
