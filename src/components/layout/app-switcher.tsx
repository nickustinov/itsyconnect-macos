"use client";

import { useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { CaretUpDown, Package, MagnifyingGlass } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { useApps } from "@/lib/apps-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import { AppIcon } from "@/components/app-icon";
import { getAppState, getLastAppId } from "@/lib/nav-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { appId } = useParams<{ appId?: string }>();
  const { isMobile } = useSidebar();
  const { apps, loading, truncated } = useApps();
  const { guardNavigation } = useFormDirty();
  const [search, setSearch] = useState("");

  const activeApp = apps.find((a) => a.id === appId)
    ?? apps.find((a) => a.id === getLastAppId());

  const filteredApps = useMemo(() => {
    if (!search) return apps;
    const q = search.toLowerCase();
    return apps.filter(
      (a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
    );
  }, [apps, search]);

  /** Subpages that persist across app switches (Insights + TestFlight + ASO). */
  const STICKY_SUBPAGES = new Set([
    "reviews", "analytics", "sales", "testflight", "aso",
  ]);

  function buildAppUrl(targetAppId: string): string {
    const saved = getAppState(targetAppId);
    if (saved) return `/dashboard/apps/${targetAppId}${saved}`;

    // Fallback: sticky subpage logic for never-visited apps
    if (!appId) return `/dashboard/apps/${targetAppId}`;
    const subpath = pathname.replace(`/dashboard/apps/${appId}`, "").replace(/^\//, "");
    const topSegment = subpath.split("/")[0];
    if (topSegment && STICKY_SUBPAGES.has(topSegment)) {
      return `/dashboard/apps/${targetAppId}/${topSegment}`;
    }
    return `/dashboard/apps/${targetAppId}`;
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              suppressHydrationWarning
            >
              {loading ? (
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-muted">
                  <Spinner className="text-muted-foreground" />
                </div>
              ) : activeApp ? (
                <AppIcon
                  iconUrl={activeApp.iconUrl}
                  name={activeApp.name}
                  className="size-8"
                  iconSize={16}
                />
              ) : null}
              <span className="truncate font-semibold text-sm">
                {activeApp?.name ?? "Select an app"}
              </span>
              <CaretUpDown className="ml-auto" size={16} />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
            onCloseAutoFocus={() => setSearch("")}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Apps
            </DropdownMenuLabel>
            {apps.length > 5 && (
              <div className="px-2 pb-1">
                <div className="relative">
                  <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Search apps…"
                    className="h-8 w-full rounded-md border bg-transparent pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    autoFocus
                  />
                </div>
              </div>
            )}
            <div className="max-h-72 overflow-y-auto">
              {apps.length === 0 && !loading && (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No apps found
                </div>
              )}
              {filteredApps.length === 0 && search && (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No matching apps
                </div>
              )}
              {filteredApps.map((app) => {
                const idx = apps.indexOf(app);
                return (
                  <DropdownMenuItem
                    key={app.id}
                    onClick={() => guardNavigation(() => router.push(buildAppUrl(app.id)))}
                    className="gap-2 p-2"
                  >
                    <AppIcon
                      iconUrl={app.iconUrl}
                      name={app.name}
                      className="size-6"
                      iconSize={12}
                      rounded="rounded-md"
                    />
                    <div className="grid flex-1 leading-tight">
                      <span className="truncate font-medium">{app.name}</span>
                      <span className="truncate text-xs font-mono text-muted-foreground">
                        {app.id}
                      </span>
                    </div>
                    {idx >= 0 && idx < 9 && !search && (
                      <kbd className="shrink-0 text-[13px] text-muted-foreground/50">⌘{idx + 1}</kbd>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </div>
            {truncated && (
              <DropdownMenuItem
                onClick={() => router.push("/settings/license")}
                className="gap-2 p-2 text-muted-foreground"
              >
                <Package size={16} weight="duotone" />
                <span className="text-xs">Upgrade to Pro for all apps</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
