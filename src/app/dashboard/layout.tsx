"use client";

import { Suspense, useEffect } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DashboardBreadcrumb } from "@/components/layout/dashboard-breadcrumb";
import { HeaderVersionPicker } from "@/components/layout/header-version-picker";
import { HeaderBuildsPicker } from "@/components/layout/header-builds-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppsProvider, useApps } from "@/lib/apps-context";

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
      <ReadySignal />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="h-screen overflow-hidden">
          <header className="drag flex h-16 shrink-0 items-center gap-2 border-b bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex flex-1 items-center gap-2 px-4">
              <div className="no-drag">
                <DashboardBreadcrumb />
              </div>
              <div className="no-drag ml-auto flex items-center gap-2">
                <Suspense>
                  <HeaderBuildsPicker />
                  <HeaderVersionPicker />
                </Suspense>
                <ThemeToggle />
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto pt-6 pb-8">
            <div className="mx-auto w-full max-w-6xl px-6">
              <Suspense>{children}</Suspense>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AppsProvider>
  );
}
