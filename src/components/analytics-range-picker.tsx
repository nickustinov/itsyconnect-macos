"use client";

import { useState, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarBlank } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { parseRange, type DateRange } from "@/lib/analytics-range";
import type { DateRange as RdpDateRange } from "react-day-picker";

const PRESETS = [
  { value: "1d", label: "1d" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
] as const;

function generateMonths(count: number): Array<{ value: string; label: string }> {
  const months: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en", { month: "long", year: "numeric" });
    months.push({ value, label });
  }
  return months;
}

export function AnalyticsRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarRange, setCalendarRange] = useState<RdpDateRange | undefined>();

  const currentRange = searchParams.get("range");
  const parsed = parseRange(currentRange);

  const months = useMemo(() => generateMonths(12), []);

  function navigate(rangeValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (rangeValue === "30d") {
      params.delete("range");
    } else {
      params.set("range", rangeValue);
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
    setOpen(false);
    setShowCalendar(false);
  }

  function handleCalendarSelect(range: RdpDateRange | undefined) {
    setCalendarRange(range);
    if (!range?.from || !range?.to) return;
    // Ignore single-click where from === to (first click in range selection)
    if (range.from.getTime() === range.to.getTime()) return;
    const from = range.from.toISOString().slice(0, 10);
    const to = range.to.toISOString().slice(0, 10);
    navigate(`${from}..${to}`);
  }

  // Derive calendar default month from current range
  const calendarDefault = useMemo(() => new Date(parsed.from + "T00:00:00"), [parsed.from]);

  // Determine which preset/month is active
  const activePreset = PRESETS.find((p) => p.value === currentRange)?.value
    ?? (!currentRange ? "30d" : null);
  const activeMonth = months.find((m) => m.value === currentRange)?.value ?? null;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowCalendar(false); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="mb-1 gap-1.5 text-sm">
          <CalendarBlank className="size-4" />
          {parsed.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto p-0"
        onFocusOutside={(e) => { if (showCalendar) e.preventDefault(); }}
      >
        {showCalendar ? (
          <div className="p-2">
            <Button
              variant="ghost"
              size="xs"
              className="mb-1"
              onClick={() => setShowCalendar(false)}
            >
              &larr; Back
            </Button>
            <Calendar
              mode="range"
              selected={calendarRange}
              defaultMonth={calendarDefault}
              numberOfMonths={2}
              disabled={{ after: new Date() }}
              onSelect={handleCalendarSelect}
            />
          </div>
        ) : (
          <div className="p-3">
            {/* Quick ranges */}
            <div className="flex gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.value}
                  variant={activePreset === p.value ? "default" : "outline"}
                  size="xs"
                  onClick={() => navigate(p.value)}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <Separator className="my-2.5" />

            {/* Months */}
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              Month
            </p>
            <ScrollArea className="h-[180px]">
              <div className="flex flex-col gap-0.5 pr-3">
                {months.map((m) => (
                  <Button
                    key={m.value}
                    variant={activeMonth === m.value ? "secondary" : "ghost"}
                    size="sm"
                    className="justify-start text-sm"
                    onClick={() => navigate(m.value)}
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
            </ScrollArea>

            <Separator className="my-2.5" />

            {/* Custom range */}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => { setCalendarRange(undefined); setShowCalendar(true); }}
            >
              Custom range&hellip;
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
