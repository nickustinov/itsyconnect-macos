"use client";

import { useState, useEffect, useRef } from "react";
import {
  CaretLeft,
  CaretRight,
  CloudArrowUp,
  Plus,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  screenshotImageUrl,
  displayTypeLabel,
  DISPLAY_TYPE_SIZES,
  type AscScreenshotSet,
} from "@/lib/asc/display-types";
import { SortableScreenshot, UploadingPlaceholder } from "./sortable-screenshot";
import { useTranslations } from "@/lib/i18n/locale-context";

// ---------------------------------------------------------------------------
// Screenshot set card
// ---------------------------------------------------------------------------

export function ScreenshotSetCard({
  set,
  readOnly,
  uploading,
  deletingIds,
  sensors,
  onUpload,
  onDelete,
  onDeleteSet,
  onDragEnd,
}: {
  set: AscScreenshotSet;
  readOnly: boolean;
  uploading: boolean;
  deletingIds: Set<string>;
  sensors: ReturnType<typeof useSensors>;
  onUpload: (setId: string, file: File) => void;
  onDelete: (screenshotId: string) => void;
  onDeleteSet: (setId: string) => void;
  onDragEnd: (setId: string, event: DragEndEvent) => void;
}) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);
  const displayType = set.attributes.screenshotDisplayType;
  const size = DISPLAY_TYPE_SIZES[displayType];

  const previewableScreenshots = set.screenshots.filter(
    (s) =>
      s.attributes.assetDeliveryState?.state === "COMPLETE" &&
      !!s.attributes.assetToken,
  );

  // Preload full-size images in background so lightbox opens instantly
  useEffect(() => {
    for (const s of previewableScreenshots) {
      const img = new Image();
      img.src = screenshotImageUrl(s.attributes.assetToken!, 1200);
    }
  }, [previewableScreenshots]);

  const previewScreenshot =
    previewIndex !== null ? previewableScreenshots[previewIndex] : null;

  useEffect(() => {
    if (previewIndex === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPreviewIndex(null);
      } else if (e.key === "ArrowLeft" && previewIndex! > 0) {
        setPreviewIndex((i) => i! - 1);
      } else if (
        e.key === "ArrowRight" &&
        previewIndex! < previewableScreenshots.length - 1
      ) {
        setPreviewIndex((i) => i! + 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewIndex, previewableScreenshots.length]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {displayTypeLabel(displayType)}
          {size && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {size} px
            </span>
          )}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            · {set.screenshots.length === 1
              ? t("screenshots.screenshotCount", { count: set.screenshots.length })
              : t("screenshots.screenshotCountPlural", { count: set.screenshots.length })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent
        onDragEnter={(e) => {
          if (readOnly) return;
          e.preventDefault();
          dragCounter.current++;
          setDragOver(true);
        }}
        onDragOver={(e) => {
          if (readOnly) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => {
          dragCounter.current--;
          if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            setDragOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragCounter.current = 0;
          setDragOver(false);
          if (readOnly) return;
          const files = Array.from(e.dataTransfer.files).filter((f) =>
            f.type === "image/png" || f.type === "image/jpeg",
          );
          for (const file of files) {
            onUpload(set.id, file);
          }
        }}
        className={dragOver ? "ring-2 ring-primary ring-inset rounded-lg" : ""}
      >
        {set.screenshots.length === 0 && !uploading ? (
          <div className={cn(
            "flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center",
            dragOver && "border-primary bg-primary/5",
          )}>
            <CloudArrowUp size={32} className={dragOver ? "text-primary" : "text-muted-foreground/40"} />
            <p className="mt-2 text-sm text-muted-foreground">
              {dragOver ? t("screenshots.dropToUpload") : t("screenshots.noScreenshotsUploaded")}
            </p>
            {!readOnly && !dragOver && (
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                >
                  <Plus size={14} className="mr-1.5" />
                  {t("screenshots.addScreenshot")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => onDeleteSet(set.id)}
                >
                  {t("screenshots.removeVariant")}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => onDragEnd(set.id, event)}
          >
            <SortableContext
              items={set.screenshots.map((s) => s.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex gap-3 overflow-x-auto pb-2">
                {set.screenshots.map((ss) => (
                  <SortableScreenshot
                    key={ss.id}
                    screenshot={ss}
                    readOnly={readOnly}
                    deleting={deletingIds.has(ss.id)}
                    onDelete={onDelete}
                    onPreview={() => {
                      const idx = previewableScreenshots.findIndex(
                        (s) => s.id === ss.id,
                      );
                      if (idx !== -1) setPreviewIndex(idx);
                    }}
                  />
                ))}

                {uploading && <UploadingPlaceholder />}

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex h-[232px] w-[80px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-muted-foreground hover:border-foreground/30 hover:text-foreground/70"
                  >
                    <Plus size={20} />
                    <span className="text-xs">{t("common.add")}</span>
                  </button>
                )}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {!readOnly && (
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onUpload(set.id, file);
                e.target.value = "";
              }
            }}
          />
        )}
      </CardContent>

      {/* Screenshot preview lightbox */}
      <Dialog
        open={previewIndex !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewIndex(null);
        }}
      >
        <DialogPortal>
          <DialogOverlay
            className="bg-black/80"
            onClick={() => setPreviewIndex(null)}
          />
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={() => setPreviewIndex(null)}
          >
            <DialogTitle className="sr-only">{t("screenshots.screenshotPreview")}</DialogTitle>
            {previewScreenshot && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={previewIndex === 0}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white",
                    previewIndex === 0
                      ? "bg-white/5 text-white/20"
                      : "bg-white/15 hover:bg-white/25",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (previewIndex! > 0) setPreviewIndex(previewIndex! - 1);
                  }}
                >
                  <CaretLeft size={24} />
                </button>
                <img
                  src={screenshotImageUrl(
                    previewScreenshot.attributes.assetToken!,
                    1200,
                  )}
                  alt={previewScreenshot.attributes.fileName}
                  className="max-h-[85vh] max-w-[85vw] object-contain"
                />
                <button
                  type="button"
                  disabled={previewIndex === previewableScreenshots.length - 1}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white",
                    previewIndex === previewableScreenshots.length - 1
                      ? "bg-white/5 text-white/20"
                      : "bg-white/15 hover:bg-white/25",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (previewIndex! < previewableScreenshots.length - 1)
                      setPreviewIndex(previewIndex! + 1);
                  }}
                >
                  <CaretRight size={24} />
                </button>
              </div>
            )}
          </div>
        </DialogPortal>
      </Dialog>
    </Card>
  );
}
