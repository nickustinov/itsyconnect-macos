"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Teams", segment: "" },
  { label: "AI", segment: "/ai" },
  { label: "Appearance", segment: "/appearance" },
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="drag h-12 shrink-0" />
      <div className="w-full flex-1 px-8 pb-8">
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
        <div className="mb-6 flex items-center border-b">
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
        {children}
      </div>
    </div>
  );
}
