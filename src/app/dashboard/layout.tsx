"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DashboardBreadcrumb } from "@/components/layout/dashboard-breadcrumb";
import dynamic from "next/dynamic";

const HeaderVersionPicker = dynamic(
  () => import("@/components/layout/header-version-picker").then(m => ({ default: m.HeaderVersionPicker })),
  { ssr: false },
);
const HeaderVersionActions = dynamic(
  () => import("@/components/layout/header-version-picker").then(m => ({ default: m.HeaderVersionActions })),
  { ssr: false },
);
const HeaderRefreshButton = dynamic(
  () => import("@/components/layout/header-version-picker").then(m => ({ default: m.HeaderRefreshButton })),
  { ssr: false },
);
const HeaderInsightsButton = dynamic(
  () => import("@/components/layout/header-insights-button").then(m => ({ default: m.HeaderInsightsButton })),
  { ssr: false },
);
const HeaderLocalePicker = dynamic(
  () => import("@/components/layout/header-locale-picker").then(m => ({ default: m.HeaderLocalePicker })),
  { ssr: false },
);
import { VersionActionFooter } from "@/components/layout/version-action-footer";
import { BuildActionFooter } from "@/components/layout/build-action-footer";
import { AppsProvider, useApps } from "@/lib/apps-context";
import { VersionsProvider } from "@/lib/versions-context";
import { PreReleaseVersionsProvider } from "@/lib/pre-release-versions-context";
import { FormDirtyProvider } from "@/lib/form-dirty-context";
import { HeaderLocaleProvider } from "@/lib/header-locale-context";
import { SubmissionChecklistProvider } from "@/lib/submission-checklist-context";
import { BuildActionProvider } from "@/lib/build-action-context";
import { RefreshProvider } from "@/lib/refresh-context";
import { FooterPortalProvider } from "@/lib/footer-portal-context";
import { ConnectionBanner } from "@/components/layout/connection-banner";
import { DemoBanner } from "@/components/layout/demo-banner";
import { BreadcrumbProvider } from "@/lib/breadcrumb-context";
import { ErrorReportProvider } from "@/lib/error-report-context";
import { InsightsPanelProvider, useInsightsPanel } from "@/lib/insights-panel-context";
import { LicenseProvider } from "@/lib/license-context";
import { saveNavigation } from "@/lib/nav-state";

declare global {
  interface Window {
    electron?: {
      ready: () => void;
      onNavigate: (cb: (path: string) => void) => () => void;
      updates: {
        checkNow: () => void;
        onStatus: (cb: (status: { state: string; message?: string }) => void) => () => void;
        getAutoCheck: () => Promise<boolean>;
        setAutoCheck: (enabled: boolean) => void;
      };
      store: {
        purchase: () => Promise<void>;
        restore: () => Promise<void>;
        getProduct: () => Promise<{ title: string; price: string } | null>;
        onLicenseUpdated: (cb: () => void) => () => void;
        onError: (cb: (message: string) => void) => () => void;
      };
    };
  }
}

function ReadySignal() {
  const { loading } = useApps();

  useEffect(() => {
    if (!loading) {
      // Delay to let the router redirect settle before showing window
      const id = setTimeout(() => window.electron?.ready(), 300);
      return () => clearTimeout(id);
    }
  }, [loading]);

  return null;
}

const INSIGHTS_PANEL_WIDTH = "18rem";

function ScrollableContent({ children }: { children: React.ReactNode }) {
  const { open } = useInsightsPanel();
  const pathname = usePathname();
  const onReviews = pathname.match(/\/reviews$/);
  return (
    <div
      className="flex flex-1 flex-col overflow-y-auto pt-6 pb-8"
      style={{ paddingRight: open && onReviews ? INSIGHTS_PANEL_WIDTH : undefined }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6">
        {children}
      </div>
    </div>
  );
}

function NavigationTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    saveNavigation(pathname, searchParams.toString());
  }, [pathname, searchParams]);

  return null;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LicenseProvider>
    <AppsProvider>
      <VersionsProvider>
      <PreReleaseVersionsProvider>
      <FormDirtyProvider>
      <ErrorReportProvider>
      <HeaderLocaleProvider>
      <SubmissionChecklistProvider>
      <BuildActionProvider>
      <RefreshProvider>
      <BreadcrumbProvider>
      <ReadySignal />
      <Suspense>
        <NavigationTracker />
      </Suspense>
      <SidebarProvider>
        <Suspense>
          <AppSidebar />
        </Suspense>
        <SidebarInset className="h-screen overflow-hidden">
          <InsightsPanelProvider>
          <header className="drag flex h-16 shrink-0 items-center gap-2 border-b bg-sidebar transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="drag flex flex-1 items-center gap-2 px-4">
              <div className="no-drag flex items-center gap-2">
                <Suspense>
                  <DashboardBreadcrumb />
                </Suspense>
                <Suspense>
                  <HeaderVersionPicker />
                </Suspense>
                <Suspense>
                  <HeaderLocalePicker />
                </Suspense>
              </div>
              <div className="no-drag ml-auto flex items-center gap-2">
                <Suspense>
                  <HeaderVersionActions />
                </Suspense>
                <Suspense>
                  <HeaderInsightsButton />
                </Suspense>
                <Suspense>
                  <HeaderRefreshButton />
                </Suspense>
              </div>
            </div>
          </header>
          <DemoBanner />
          <ConnectionBanner />
          <FooterPortalProvider>
          <ScrollableContent>
            <Suspense>{children}</Suspense>
          </ScrollableContent>
          </FooterPortalProvider>
          <Suspense>
            <VersionActionFooter />
          </Suspense>
          <Suspense>
            <BuildActionFooter />
          </Suspense>
          </InsightsPanelProvider>
        </SidebarInset>
      </SidebarProvider>
      </BreadcrumbProvider>
      </RefreshProvider>
      </BuildActionProvider>
      </SubmissionChecklistProvider>
      </HeaderLocaleProvider>
      </ErrorReportProvider>
      </FormDirtyProvider>
      </PreReleaseVersionsProvider>
      </VersionsProvider>
    </AppsProvider>
    </LicenseProvider>
  );
}
