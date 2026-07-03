"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { SquaresFour, ChatsCircle } from "@phosphor-icons/react";
import { getLastAppId, getAppState } from "@/lib/nav-state";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useFormDirty } from "@/lib/form-dirty-context";
import { AppSwitcher } from "./app-switcher";
import { NavMain } from "./nav-main";
import { NavFooter } from "./nav-footer";
import { useUnreadReviewsPoller } from "@/lib/hooks/use-unread-reviews";
import { useGlobalUnseenCount } from "@/lib/hooks/use-seen-reviews";
import { useApps } from "@/lib/apps-context";
import { useTranslations } from "@/lib/i18n/locale-context";

function PortfolioButton() {
  const pathname = usePathname();
  const router = useRouter();
  const { isDirty, guardNavigation } = useFormDirty();
  const t = useTranslations();
  const isActive = pathname === "/dashboard";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={`${t("nav.portfolio")} ⌘P`} isActive={isActive}>
          <Link
            href="/dashboard"
            onNavigate={(e) => {
              if (!isDirty) return;
              e.preventDefault();
              guardNavigation(() => router.push("/dashboard"));
            }}
          >
            <SquaresFour size={16} />
            <span>{t("nav.portfolio")}</span>
            <kbd className="ml-auto text-[13px] text-muted-foreground/50">⌘P</kbd>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function ReviewCenterButton() {
  const pathname = usePathname();
  const router = useRouter();
  const { isDirty, guardNavigation } = useFormDirty();
  const t = useTranslations();
  const isActive = pathname === "/dashboard/reviews";
  const unseen = useGlobalUnseenCount();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={`${t("nav.reviewCenter")} ⌘⇧R`} isActive={isActive}>
          <Link
            href="/dashboard/reviews"
            onNavigate={(e) => {
              if (!isDirty) return;
              e.preventDefault();
              guardNavigation(() => router.push("/dashboard/reviews"));
            }}
          >
            <ChatsCircle size={16} />
            <span>{t("nav.reviewCenter")}</span>
            {unseen > 0 ? (
              <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
                {unseen}
              </span>
            ) : (
              <kbd className="ml-auto text-[13px] text-muted-foreground/50">⌘⇧R</kbd>
            )}
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
      if (e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        guardNavigation(() => router.push("/dashboard/reviews"));
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
      <SidebarFooter>
        <PortfolioButton />
        <ReviewCenterButton />
        <NavFooter />
      </SidebarFooter>
    </Sidebar>
  );
}
