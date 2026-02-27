"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApps } from "@/lib/apps-context";
import { SpinnerGap, AppWindow } from "@phosphor-icons/react";

export default function DashboardPage() {
  const router = useRouter();
  const { apps, loading } = useApps();

  useEffect(() => {
    if (!loading && apps.length > 0) {
      router.replace(`/dashboard/apps/${apps[0].id}`);
    }
  }, [apps, loading, router]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <SpinnerGap size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
          <AppWindow size={32} className="text-muted-foreground" />
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">No apps yet</h1>
        <p className="mt-2 max-w-sm text-muted-foreground">
          Itsyship doesn&apos;t support creating apps yet. Create your apps in{" "}
          <a
            href="https://appstoreconnect.apple.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            App Store Connect
          </a>{" "}
          first, then they&apos;ll appear here automatically.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          If you&apos;ve already added apps, check your{" "}
          <a
            href="/dashboard/settings"
            className="text-primary underline-offset-4 hover:underline"
          >
            ASC credentials
          </a>{" "}
          in settings.
        </p>
      </div>
    );
  }

  return null;
}
