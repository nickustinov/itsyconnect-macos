"use client";

import { useState } from "react";
import { Plus, Trash, CalendarBlank, Calendar as CalendarIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppMarkers } from "@/lib/hooks/use-app-markers";
import { formatDateShort } from "@/lib/format";
import { useTranslations } from "@/lib/i18n/locale-context";

interface MarkersDialogProps {
  appId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromIso(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

export function MarkersDialog({ appId, open, onOpenChange }: MarkersDialogProps) {
  const t = useTranslations();
  const { markers, loading, addMarker, deleteMarker } = useAppMarkers(appId);
  const [date, setDate] = useState(() => toIso(new Date()));
  const [dateOpen, setDateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd() {
    if (!date || !label.trim()) return;
    setSubmitting(true);
    try {
      await addMarker({ date, label: label.trim() });
      setLabel("");
      toast.success(t("markers.added"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("markers.addFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMarker(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("markers.deleteFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] !grid grid-rows-[auto_auto_1fr] gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>{t("markers.title")}</DialogTitle>
          <DialogDescription>
            {t("markers.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[auto_1fr_auto] items-end gap-2 pb-4">
          <div className="space-y-1">
            <Label className="text-xs">{t("markers.date")}</Label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-[170px] justify-start gap-2 font-normal"
                >
                  <CalendarBlank className="size-4" />
                  {formatDateShort(date)}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={fromIso(date)}
                  defaultMonth={fromIso(date)}
                  onSelect={(d) => {
                    if (!d) return;
                    setDate(toIso(d));
                    setDateOpen(false);
                  }}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <Label htmlFor="marker-label" className="text-xs">{t("markers.label")}</Label>
            <Input
              id="marker-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("markers.labelPlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              maxLength={80}
            />
          </div>
          <Button
            onClick={handleAdd}
            disabled={!label.trim() || !date || submitting}
          >
            <Plus size={14} />
            {t("markers.add")}
          </Button>
        </div>

        <ScrollArea className="min-h-0 overflow-hidden">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("markers.loading")}
            </p>
          ) : markers.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("markers.empty")}
            </div>
          ) : (
            <ul className="space-y-1 pr-2">
              {markers.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-2 rounded-md border bg-card/40 px-3 py-2 text-sm"
                >
                  <CalendarIcon size={14} className="text-muted-foreground" />
                  <span className="tabular-nums text-muted-foreground w-[90px] shrink-0">
                    {formatDateShort(m.date)}
                  </span>
                  <span className="flex-1 truncate">{m.label}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(m.id)}
                    title={t("markers.deleteTitle")}
                  >
                    <Trash size={14} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
