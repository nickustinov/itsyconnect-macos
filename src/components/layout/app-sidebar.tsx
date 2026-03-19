"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Package, SquaresFour } from "@phosphor-icons/react";
import { getLastAppId, getAppState } from "@/lib/nav-state";
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
  const { guardNavigation } = useFormDirty();
  const { open } = useSidebar();

  if (loading || isPro) return null;

  return (
    <div
      onClick={() => guardNavigation(() => router.push("/settings/license"))}
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
        <SidebarMenuButton asChild tooltip="Portfolio ⌘P" isActive={isActive}>
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
            <kbd className="ml-auto text-[13px] text-muted-foreground/50">⌘P</kbd>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function ScrollFadeSidebarContent({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState<"none" | "bottom" | "top" | "both">("none");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function update() {
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      const atTop = scrollTop <= 2;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 2;
      if (atTop && atBottom) setFade("none");
      else if (atTop) setFade("bottom");
      else if (atBottom) setFade("top");
      else setFade("both");
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return (
    <SidebarContent ref={ref} className={`sidebar-scroll-fade sidebar-scroll-fade--${fade}`}>
      {children}
    </SidebarContent>
  );
}

export function AppSidebar() {
  const { appId } = useParams<{ appId?: string }>();
  const router = useRouter();
  const { apps } = useApps();
  const { guardNavigation } = useFormDirty();
  const [lastAppId, setLastAppId] = useState<string>();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only localStorage read
    if (!appId) setLastAppId(getLastAppId());
  }, [appId]);
  const navAppId = appId ?? lastAppId;

  // Poll review counts for all apps to track unread state
  const appIds = useMemo(() => apps.map((a) => a.id), [apps]);
  useUnreadReviewsPoller(appIds);

  // Cmd+P → Portfolio, Cmd+1..9 → switch apps, Cmd+O/L/R/A/B → nav pages
  const PAGE_SHORTCUTS: Record<string, string> = {
    o: "",                // Overview
    l: "/store-listing",  // Store listing
    r: "/reviews",        // Reviews
    i: "/analytics",      // Analytics
    b: "/testflight",     // Builds
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.ctrlKey && !e.metaKey && !window.electron) return;
      if (e.key === "p") {
        e.preventDefault();
        guardNavigation(() => router.push("/dashboard"));
        return;
      }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9 && n <= apps.length) {
        e.preventDefault();
        const target = apps[n - 1];
        const saved = getAppState(target.id);
        const url = saved
          ? `/dashboard/apps/${target.id}${saved}`
          : `/dashboard/apps/${target.id}`;
        guardNavigation(() => router.push(url));
        return;
      }
      const activeId = appId ?? lastAppId;
      const subpath = PAGE_SHORTCUTS[e.key];
      if (activeId && subpath !== undefined) {
        e.preventDefault();
        guardNavigation(() => router.push(`/dashboard/apps/${activeId}${subpath}`));
      }
    },
    [apps, appId, lastAppId, router, guardNavigation],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="drag pt-8">
        <div className="no-drag">
          <AppSwitcher />
        </div>
      </SidebarHeader>
      <ScrollFadeSidebarContent>
        {navAppId && <NavMain appId={navAppId} />}
      </ScrollFadeSidebarContent>
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
