"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LicenseProvider } from "@/lib/license-context";

const TABS = [
  { label: "General", segment: "" },
  { label: "Appearance", segment: "/appearance" },
  { label: "Teams", segment: "/teams" },
  { label: "AI", segment: "/ai" },
  { label: "License", segment: "/license" },
  { label: "About", segment: "/about" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = "/settings";

  useEffect(() => {
    document.body.style.removeProperty("pointer-events");
  }, []);

  return (
    <LicenseProvider>
    <div className="flex h-screen flex-col bg-background">
      <div className="drag h-12 shrink-0" />
      <div className="flex shrink-0 flex-col px-8">
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            className="no-drag -ml-2 gap-1.5 text-muted-foreground"
            onClick={() => router.push("/dashboard")}
          >
            <ArrowLeft size={16} />
            Back
          </Button>
        </div>
        <div className="mb-0 flex items-center border-b overflow-x-auto scrollbar-hide">
          <nav className="-mb-px flex">
            {TABS.map((tab) => {
              const href = `${base}${tab.segment}`;
              const active =
                tab.segment === ""
                  ? pathname === base
                  : pathname.startsWith(`${base}${tab.segment}`);
              return (
                <Link
                  key={tab.segment}
                  href={href}
                  className={cn(
                    "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-8 pt-6 pb-8">
        {children}
      </div>
    </div>
    </LicenseProvider>
  );
}
