"use client";

import { Suspense, useEffect } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DashboardBreadcrumb } from "@/components/layout/dashboard-breadcrumb";
import { HeaderVersionPicker, HeaderVersionActions, HeaderRefreshButton } from "@/components/layout/header-version-picker";
import { HeaderBuildsPicker } from "@/components/layout/header-builds-picker";
import { HeaderLocalePicker } from "@/components/layout/header-locale-picker";
import { VersionActionFooter } from "@/components/layout/version-action-footer";
import { AppsProvider, useApps } from "@/lib/apps-context";
import { VersionsProvider } from "@/lib/versions-context";
import { FormDirtyProvider } from "@/lib/form-dirty-context";
import { HeaderLocaleProvider } from "@/lib/header-locale-context";
import { SubmissionChecklistProvider } from "@/lib/submission-checklist-context";
import { RefreshProvider } from "@/lib/refresh-context";

declare global {
  interface Window {
    electron?: { ready: () => void };
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppsProvider>
      <VersionsProvider>
      <FormDirtyProvider>
      <HeaderLocaleProvider>
      <SubmissionChecklistProvider>
      <RefreshProvider>
      <ReadySignal />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="h-screen overflow-hidden">
          <header className="drag flex h-16 shrink-0 items-center gap-2 border-b bg-sidebar transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="drag flex flex-1 items-center gap-2 px-4">
              <div className="no-drag flex items-center gap-2">
                <DashboardBreadcrumb />
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
                  <HeaderBuildsPicker />
                </Suspense>
                <Suspense>
                  <HeaderRefreshButton />
                </Suspense>
              </div>
            </div>
          </header>
          <div className="flex flex-1 flex-col overflow-y-auto pt-6 pb-8">
            <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6">
              <Suspense>{children}</Suspense>
            </div>
          </div>
          <Suspense>
            <VersionActionFooter />
          </Suspense>
        </SidebarInset>
      </SidebarProvider>
      </RefreshProvider>
      </SubmissionChecklistProvider>
      </HeaderLocaleProvider>
      </FormDirtyProvider>
      </VersionsProvider>
    </AppsProvider>
  );
}
