"use client";

import { Suspense } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DashboardBreadcrumb } from "@/components/layout/dashboard-breadcrumb";
import { HeaderVersionPicker } from "@/components/layout/header-version-picker";
import { HeaderBuildsPicker } from "@/components/layout/header-builds-picker";
import { AppsProvider } from "@/lib/apps-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppsProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="drag sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex flex-1 items-center gap-2 px-4">
              <div className="no-drag">
                <DashboardBreadcrumb />
              </div>
              <div className="no-drag ml-auto flex items-center gap-2">
                <Suspense>
                  <HeaderBuildsPicker />
                  <HeaderVersionPicker />
                </Suspense>
              </div>
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 pt-6 pb-8">
            <div className="mx-auto w-full max-w-6xl px-6">
              <Suspense>{children}</Suspense>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AppsProvider>
  );
}
