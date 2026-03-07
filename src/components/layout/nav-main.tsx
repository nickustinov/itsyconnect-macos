"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useFormDirty } from "@/lib/form-dirty-context";
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
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
} from "@/components/ui/sidebar";
import { useHasUnreadReviews } from "@/lib/hooks/use-unread-reviews";

interface NavItem {
  title: string;
  href: string;
  icon: Icon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function getNavGroups(appId: string): NavGroup[] {
  const base = `/dashboard/apps/${appId}`;

  return [
    {
      label: "Release",
      items: [
        { title: "Overview", href: base, icon: Gauge },
        { title: "Store listing", href: `${base}/store-listing`, icon: Storefront },
        { title: "Screenshots", href: `${base}/screenshots`, icon: Images },
        { title: "App details", href: `${base}/details`, icon: Info },
        { title: "App review", href: `${base}/review`, icon: Stamp },
      ],
    },
    {
      label: "Insights",
      items: [
        { title: "Reviews", href: `${base}/reviews`, icon: ChatsCircle },
        { title: "Analytics", href: `${base}/analytics`, icon: ChartLineUp },
        { title: "Keywords", href: `${base}/aso/keywords`, icon: MagnifyingGlass },
      ],
    },
    {
      label: "TestFlight",
      items: [
        { title: "Builds", href: `${base}/testflight`, icon: Truck },
        { title: "Groups", href: `${base}/testflight/groups`, icon: UsersThree },
        { title: "Beta app info", href: `${base}/testflight/info`, icon: Info },
        { title: "Feedback", href: `${base}/testflight/feedback`, icon: ChatDots },
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
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarMenu>
            {group.items.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
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
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
                {item.href === `${base}/reviews` && <ReviewsBadge appId={appId} />}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}

function ReviewsBadge({ appId }: { appId: string }) {
  const hasUnread = useHasUnreadReviews(appId);
  if (!hasUnread) return null;
  return (
    <SidebarMenuBadge>
      <span className="size-1.5 rounded-full bg-blue-500" />
    </SidebarMenuBadge>
  );
}
