"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useFormDirty } from "@/lib/form-dirty-context";
import { GitDiff } from "@phosphor-icons/react";
import { useChangeBuffer } from "@/lib/change-buffer-context";
import {
  Gauge,
  Storefront,
  Images,
  Stamp,
  ChatsCircle,
  ChartLineUp,
  Info,
  Truck,
  UsersThree,
  ChatDots,
  MagnifyingGlass,
  Trophy,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useHasUnreadReviews } from "@/lib/hooks/use-unread-reviews";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { MessageKey } from "@/lib/i18n/messages";

interface NavItem {
  titleKey: MessageKey;
  href: string;
  icon: Icon;
  shortcut?: string;
}

interface NavGroup {
  labelKey: MessageKey;
  items: NavItem[];
}

function getNavGroups(appId: string): NavGroup[] {
  const base = `/dashboard/apps/${appId}`;

  return [
    {
      labelKey: "nav.groups.release",
      items: [
        { titleKey: "nav.items.overview", href: base, icon: Gauge, shortcut: "⌘O" },
        { titleKey: "nav.items.storeListing", href: `${base}/store-listing`, icon: Storefront, shortcut: "⌘L" },
        { titleKey: "nav.items.screenshots", href: `${base}/screenshots`, icon: Images },
        { titleKey: "nav.items.appDetails", href: `${base}/details`, icon: Info },
        { titleKey: "nav.items.appReview", href: `${base}/review`, icon: Stamp },
      ],
    },
    {
      labelKey: "nav.groups.insights",
      items: [
        { titleKey: "nav.items.reviews", href: `${base}/reviews`, icon: ChatsCircle, shortcut: "⌘R" },
        { titleKey: "nav.items.analytics", href: `${base}/analytics`, icon: ChartLineUp, shortcut: "⌘I" },
        { titleKey: "nav.items.keywords", href: `${base}/aso/keywords`, icon: MagnifyingGlass },
      ],
    },
    {
      labelKey: "nav.groups.testflight",
      items: [
        { titleKey: "nav.items.builds", href: `${base}/testflight`, icon: Truck, shortcut: "⌘B" },
        { titleKey: "nav.items.groups", href: `${base}/testflight/groups`, icon: UsersThree },
        { titleKey: "nav.items.betaAppInfo", href: `${base}/testflight/info`, icon: Info },
        { titleKey: "nav.items.feedback", href: `${base}/testflight/feedback`, icon: ChatDots },
      ],
    },
    {
      labelKey: "nav.groups.growth",
      items: [
        { titleKey: "nav.items.nominations", href: `${base}/nominations`, icon: Trophy },
      ],
    },
  ];
}

/** Subset of search params that should persist across sidebar navigation. */
const STICKY_PARAMS = ["version", "locale"];

export function NavMain({ appId }: { appId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isDirty, guardNavigation } = useFormDirty();
  const { changes, bufferEnabled } = useChangeBuffer();
  const t = useTranslations();
  const appChanges = changes.filter((c) => c.appId === appId);
  const appChangeCount = appChanges.reduce((sum, c) => {
    let count = 0;
    const locales = c.data.locales as Record<string, Record<string, unknown>> | undefined;
    if (locales) {
      for (const fields of Object.values(locales)) count += Object.keys(fields).length;
    }
    const skip = new Set(["locales", "localeIds", "phasedReleaseId", "_reviewDetailId"]);
    for (const key of Object.keys(c.data)) {
      if (!skip.has(key)) count++;
    }
    return sum + count;
  }, 0);
  const base = `/dashboard/apps/${appId}`;
  const groups = getNavGroups(appId);

  // Build a query string from the params we want to keep
  const sticky = new URLSearchParams();
  for (const key of STICKY_PARAMS) {
    const val = searchParams.get(key);
    if (val) sticky.set(key, val);
  }
  const qs = sticky.toString();
  const suffix = qs ? `?${qs}` : "";

  function isActive(href: string): boolean {
    // Exact match for root pages (Overview)
    if (href === base) return pathname === href;

    // Builds page: exact match or build detail pages (/testflight/tfb-xxx)
    // but not other testflight sub-pages (/testflight/groups, /testflight/info, etc.)
    if (href === `${base}/testflight`) {
      if (pathname === href) return true;
      const sub = pathname.replace(href + "/", "");
      // Build detail IDs don't match known sub-routes
      return (
        pathname.startsWith(href + "/") &&
        !["groups", "info", "feedback"].some((s) => sub.startsWith(s))
      );
    }

    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {groups.map((group, groupIdx) => (
        <SidebarGroup key={group.labelKey}>
          <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
          <SidebarMenu>
            {group.items.map((item) => {
              const title = t(item.titleKey);
              return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.shortcut ? `${title} ${item.shortcut}` : title}
                  isActive={isActive(item.href)}
                >
                  <Link
                    href={`${item.href}${suffix}`}
                    onNavigate={(e) => {
                      if (!isDirty) return;
                      e.preventDefault();
                      guardNavigation(() => router.push(`${item.href}${suffix}`));
                    }}
                  >
                    <item.icon size={16} />
                    <span>{title}</span>
                    {item.href === `${base}/reviews` && <ReviewsBadge appId={appId} />}
                    {item.shortcut && (
                      <kbd className="ml-auto text-[13px] text-muted-foreground/50">{item.shortcut}</kbd>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
          {groupIdx === 0 && bufferEnabled && appChangeCount > 0 && (
            <SidebarMenu className="mt-2 border-t pt-2">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip={t("nav.diff")}
                  isActive={isActive(`${base}/review-changes`)}
                >
                  <Link href={`${base}/review-changes${suffix}`}>
                    <GitDiff size={16} />
                    <span>{t("nav.diff")}</span>
                    <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
                      {appChangeCount}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          )}
        </SidebarGroup>
      ))}
    </>
  );
}

function ReviewsBadge({ appId }: { appId: string }) {
  const hasUnread = useHasUnreadReviews(appId);
  if (!hasUnread) return null;
  return <span className="size-1.5 shrink-0 rounded-full bg-blue-500" />;
}
