"use client";

import { useParams, usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { MOCK_APPS } from "@/lib/mock-data";
import { getTFBuild, getGroup } from "@/lib/mock-testflight";

const PAGE_TITLES: Record<string, string> = {
  "store-listing": "Store listing",
  screenshots: "Screenshots",
  review: "App review",
  reviews: "Reviews",
  analytics: "Analytics",
  sales: "Sales",
  details: "App details",
};

const TF_SUB_TITLES: Record<string, string> = {
  "": "Builds",
  groups: "Groups",
  info: "Test information",
  feedback: "Feedback",
};

export function DashboardBreadcrumb() {
  const pathname = usePathname();
  const { appId } = useParams<{ appId?: string }>();

  const app = appId ? MOCK_APPS.find((a) => a.id === appId) : undefined;
  const isSettings = pathname.startsWith("/dashboard/settings");

  // Extract all segments after /dashboard/apps/[appId]/
  const segments = appId
    ? pathname
        .replace(`/dashboard/apps/${appId}`, "")
        .replace(/^\//, "")
        .split("/")
        .filter(Boolean)
    : [];

  const pageSegment = segments[0] ?? "";

  // Build breadcrumb items for TestFlight routes
  function renderTestFlightCrumbs() {
    const tfBase = `/dashboard/apps/${appId}/testflight`;
    const tfSub = segments[1] ?? "";
    const tfDetail = segments[2] ?? "";

    // /testflight/groups/[groupId]
    if (tfSub === "groups" && tfDetail) {
      const group = getGroup(tfDetail);
      return (
        <>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink href={`${tfBase}/groups`}>Groups</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>{group?.name ?? "Group"}</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    // /testflight/feedback/[feedbackId]
    if (tfSub === "feedback" && tfDetail) {
      return (
        <>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink href={`${tfBase}/feedback`}>Feedback</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>Detail</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    // /testflight/groups, /testflight/info, /testflight/feedback
    if (tfSub && tfSub in TF_SUB_TITLES) {
      return (
        <>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>{TF_SUB_TITLES[tfSub]}</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    // /testflight/[buildId]
    if (tfSub && !(tfSub in TF_SUB_TITLES)) {
      const build = getTFBuild(tfSub);
      return (
        <>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink href={tfBase}>Builds</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>
              {build ? `Build ${build.buildNumber}` : "Build"}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    // /testflight (builds list)
    return (
      <>
        <BreadcrumbSeparator className="hidden md:block" />
        <BreadcrumbItem>
          <BreadcrumbPage>{TF_SUB_TITLES[""]}</BreadcrumbPage>
        </BreadcrumbItem>
      </>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {isSettings ? (
          <BreadcrumbItem>
            <BreadcrumbPage>Settings</BreadcrumbPage>
          </BreadcrumbItem>
        ) : app ? (
          <>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href={`/dashboard/apps/${app.id}`}>
                {app.name}
              </BreadcrumbLink>
            </BreadcrumbItem>
            {pageSegment === "testflight" ? (
              renderTestFlightCrumbs()
            ) : PAGE_TITLES[pageSegment] ? (
              <>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{PAGE_TITLES[pageSegment]}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : null}
          </>
        ) : (
          <BreadcrumbItem>
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
