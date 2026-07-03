"use client";

import { useParams, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useApps } from "@/lib/apps-context";
import { useBreadcrumbTitle } from "@/lib/breadcrumb-context";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { MessageKey } from "@/lib/i18n/messages";

const PAGE_KEYS: Record<string, MessageKey> = {
  "store-listing": "breadcrumb.pages.storeListing",
  screenshots: "breadcrumb.pages.screenshots",
  review: "breadcrumb.pages.review",
  "review-changes": "breadcrumb.pages.reviewChanges",
  reviews: "breadcrumb.pages.reviews",
  analytics: "breadcrumb.pages.analytics",
  sales: "breadcrumb.pages.sales",
  details: "breadcrumb.pages.details",
  aso: "breadcrumb.pages.aso",
  nominations: "breadcrumb.pages.nominations",
};

const TF_SUB_KEYS: Record<string, MessageKey> = {
  "": "breadcrumb.testflight.builds",
  groups: "breadcrumb.testflight.groups",
  info: "breadcrumb.testflight.info",
  feedback: "breadcrumb.testflight.feedback",
};

export function DashboardBreadcrumb() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { appId } = useParams<{ appId?: string }>();
  const t = useTranslations();

  const { apps } = useApps();
  const app = appId ? apps.find((a) => a.id === appId) : undefined;
  const dynamicTitle = useBreadcrumbTitle();
  const isSettings = pathname.startsWith("/settings");
  const isReviewCenter = pathname === "/dashboard/reviews";

  const segments = appId
    ? pathname
        .replace(`/dashboard/apps/${appId}`, "")
        .replace(/^\//, "")
        .split("/")
        .filter(Boolean)
    : [];

  const pageSegment = segments[0] ?? "";

  if (pageSegment === "review-changes") return null;

  function renderTestFlightCrumbs() {
    const tfBase = `/dashboard/apps/${appId}/testflight`;
    const tfSub = segments[1] ?? "";
    const tfDetail = segments[2] ?? "";

    if (tfSub === "groups" && tfDetail) {
      const groupName = dynamicTitle ?? t("breadcrumb.group");
      return (
        <>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink asChild><Link href={`${tfBase}/groups`}>{t("breadcrumb.testflight.groups")}</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>{groupName}</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    if (tfSub === "feedback" && tfDetail) {
      return (
        <>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink asChild><Link href={`${tfBase}/feedback`}>{t("breadcrumb.testflight.feedback")}</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("breadcrumb.detail")}</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    if (tfSub && tfSub in TF_SUB_KEYS) {
      return (
        <>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>{t(TF_SUB_KEYS[tfSub])}</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    if (tfSub && !(tfSub in TF_SUB_KEYS)) {
      const buildLabel = dynamicTitle ?? t("breadcrumb.build");
      const qs = searchParams.toString();
      const buildsHref = qs ? `${tfBase}?${qs}` : tfBase;
      return (
        <>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink asChild><Link href={buildsHref}>{t("breadcrumb.testflight.builds")}</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>{buildLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    return (
      <>
        <BreadcrumbSeparator className="hidden md:block" />
        <BreadcrumbItem>
          <BreadcrumbPage>{t(TF_SUB_KEYS[""])}</BreadcrumbPage>
        </BreadcrumbItem>
      </>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {isSettings ? (
          <BreadcrumbItem>
            <BreadcrumbPage>{t("breadcrumb.settings")}</BreadcrumbPage>
          </BreadcrumbItem>
        ) : isReviewCenter ? (
          <BreadcrumbItem>
            <BreadcrumbPage>{t("breadcrumb.reviewCenter")}</BreadcrumbPage>
          </BreadcrumbItem>
        ) : app ? (
          <>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink asChild>
                <Link href={`/dashboard/apps/${app.id}`}>
                  {app.name.length > 10 ? `${app.name.slice(0, 10)}…` : app.name}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {pageSegment === "testflight" ? (
              renderTestFlightCrumbs()
            ) : pageSegment === "nominations" && segments[1] ? (
              <>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink asChild><Link href={`/dashboard/apps/${appId}/nominations`}>{t("breadcrumb.pages.nominations")}</Link></BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {dynamicTitle ?? (segments[1] === "new" ? t("breadcrumb.newNomination") : t("breadcrumb.detail"))}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : (
              <>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {pageSegment in PAGE_KEYS ? t(PAGE_KEYS[pageSegment]) : t("breadcrumb.overview")}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </>
        ) : (
          <BreadcrumbItem>
            <BreadcrumbPage>{t("breadcrumb.portfolio")}</BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
