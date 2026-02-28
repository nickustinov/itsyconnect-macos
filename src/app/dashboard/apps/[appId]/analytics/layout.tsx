"use client";

import Link from "next/link";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AnalyticsProvider } from "@/lib/analytics-context";

const TABS = [
  { label: "Overview", segment: "" },
  { label: "Acquisition", segment: "/acquisition" },
  { label: "Usage", segment: "/usage" },
  { label: "Crashes", segment: "/crashes" },
];

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { appId } = useParams<{ appId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const base = `/dashboard/apps/${appId}/analytics`;
  const range = searchParams.get("range") || "30d";

  function buildHref(segment: string, newRange?: string) {
    const r = newRange || range;
    return `${base}${segment}${r !== "30d" ? `?range=${r}` : ""}`;
  }

  // Derive current segment so the select can preserve it
  const currentSegment =
    TABS.find((t) =>
      t.segment === ""
        ? pathname === base
        : pathname.startsWith(`${base}${t.segment}`),
    )?.segment ?? "";

  // Crash data is monthly aggregate – range picker doesn't apply
  const showRangePicker = currentSegment !== "/crashes";

  return (
    <AnalyticsProvider appId={appId}>
      <div className="flex flex-1 flex-col gap-6">
        <div className="flex items-center justify-between border-b">
          <nav className="-mb-px flex">
            {TABS.map((tab) => {
              const href = buildHref(tab.segment);
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
          {showRangePicker && (
            <Select
              value={range}
              onValueChange={(v) => {
                router.replace(buildHref(currentSegment, v));
              }}
            >
              <SelectTrigger className="mb-1 w-[140px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        {children}
      </div>
    </AnalyticsProvider>
  );
}
