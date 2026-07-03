"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarBlank } from "@phosphor-icons/react";
import { useTranslations } from "@/lib/i18n/locale-context";

export function ReleaseSettings({
  releaseType,
  onReleaseTypeChange,
  scheduledDate,
  onScheduledDateChange,
  phasedRelease,
  onPhasedReleaseChange,
  readOnly,
}: {
  releaseType: string;
  onReleaseTypeChange: (value: string) => void;
  scheduledDate: Date | undefined;
  onScheduledDateChange: (date: Date | undefined) => void;
  phasedRelease: boolean;
  onPhasedReleaseChange: (value: boolean) => void;
  readOnly: boolean;
}) {
  const t = useTranslations();

  return (
    <section className="space-y-6">
      <h3 className="section-title">{t("storeListing.release.title")}</h3>

      <div className="space-y-3">
        <p className="text-sm font-medium">{t("storeListing.release.method")}</p>
        <Tabs
          value={releaseType}
          onValueChange={readOnly ? undefined : onReleaseTypeChange}
          className="w-full max-w-md"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="automatically" disabled={readOnly}>
              {t("storeListing.release.automatic")}
            </TabsTrigger>
            <TabsTrigger value="manually" disabled={readOnly}>
              {t("storeListing.release.manual")}
            </TabsTrigger>
            <TabsTrigger value="after-date" disabled={readOnly}>
              {t("storeListing.release.scheduled")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-sm text-muted-foreground">
          {releaseType === "automatically" && t("storeListing.release.automaticHint")}
          {releaseType === "manually" && t("storeListing.release.manualHint")}
          {releaseType === "after-date" && t("storeListing.release.scheduledHint")}
        </p>
        {releaseType === "after-date" && (
          <div className="pt-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  disabled={readOnly}
                  className="w-full max-w-xs justify-start gap-2 font-normal"
                >
                  <CalendarBlank size={16} className="text-muted-foreground" />
                  {scheduledDate
                    ? scheduledDate.toLocaleString(undefined, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : t("storeListing.release.pickDate")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={scheduledDate}
                  onSelect={(date) => {
                    if (!date) return;
                    const prev = scheduledDate;
                    date.setHours(prev?.getHours() ?? 12, prev?.getMinutes() ?? 0, 0, 0);
                    onScheduledDateChange(date);
                  }}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                />
                <div className="border-t px-3 py-2">
                  <Label className="text-xs text-muted-foreground">{t("storeListing.release.time")}</Label>
                  <Input
                    type="time"
                    value={scheduledDate
                      ? `${String(scheduledDate.getHours()).padStart(2, "0")}:${String(scheduledDate.getMinutes()).padStart(2, "0")}`
                      : "12:00"}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(":").map(Number);
                      const d = scheduledDate ? new Date(scheduledDate) : new Date();
                      d.setHours(h, m, 0, 0);
                      onScheduledDateChange(d);
                    }}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">{t("storeListing.release.phasedRollout")}</p>
        <p className="text-sm text-muted-foreground">
          {t("storeListing.release.phasedHint")}
        </p>
        <div className="flex items-center gap-3">
          <Switch
            checked={phasedRelease}
            onCheckedChange={onPhasedReleaseChange}
            disabled={readOnly}
          />
          <Label className="text-sm">{t("storeListing.release.enablePhased")}</Label>
        </div>
      </div>
    </section>
  );
}
