"use client";

import { DownloadSimple, WarningCircle, X } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  screenshotImageUrl,
  screenshotErrorMessage,
  type AscScreenshot,
} from "@/lib/asc/display-types";
import { useTranslations } from "@/lib/i18n/locale-context";

// ---------------------------------------------------------------------------
// Sortable screenshot thumbnail
// ---------------------------------------------------------------------------

export function SortableScreenshot({
  screenshot,
  readOnly,
  deleting,
  onDelete,
  onPreview,
}: {
  screenshot: AscScreenshot;
  readOnly: boolean;
  deleting: boolean;
  onDelete: (id: string) => void;
  onPreview: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: screenshot.id, disabled: readOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const assetDelivery = screenshot.attributes.assetDeliveryState;
  const deliveryState = assetDelivery?.state;
  const isComplete = deliveryState === "COMPLETE";
  const isFailed = deliveryState === "FAILED";
  const hasToken = !!screenshot.attributes.assetToken;
  const errorMessage = isFailed
    ? screenshotErrorMessage(assetDelivery?.errors ?? [])
    : "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative shrink-0"
    >
      <div
        className="flex flex-col items-center gap-1.5 rounded-lg border bg-muted/30 p-2"
        {...attributes}
        {...listeners}
      >
        {isComplete && hasToken ? (
          <button
            type="button"
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
          >
            <img
              src={screenshotImageUrl(screenshot.attributes.assetToken!, 300)}
              alt={screenshot.attributes.fileName}
              className="h-[200px] w-auto rounded object-contain"
              loading="lazy"
            />
          </button>
        ) : isFailed ? (
          <div
            className="flex h-[200px] w-[112px] flex-col items-center justify-center gap-1.5 rounded bg-destructive/5"
            title={errorMessage}
          >
            <WarningCircle size={24} className="text-destructive/60" />
            <span className="max-w-[100px] text-center text-[10px] leading-tight text-destructive/60">
              {errorMessage}
            </span>
          </div>
        ) : (
          <div className="flex h-[200px] w-[112px] items-center justify-center rounded bg-muted">
            <Spinner className="size-6 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Action buttons -- top-right vertical stack */}
      <div className="absolute top-1 right-1 flex flex-col gap-1">
        {!readOnly && (
          deleting ? (
            <div className="rounded-full bg-destructive p-1 text-white shadow-sm">
              <Spinner className="size-3" />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onDelete(screenshot.id)}
              className="hidden rounded-full bg-destructive p-1 text-white shadow-sm hover:bg-destructive/90 group-hover:block"
            >
              <X size={12} />
            </button>
          )
        )}
        {isComplete && hasToken && (
          <a
            href={`/api/screenshot-download?url=${encodeURIComponent(screenshotImageUrl(screenshot.attributes.assetToken!, 4000))}&name=${encodeURIComponent(screenshot.attributes.fileName)}`}
            download={screenshot.attributes.fileName}
            onClick={(e) => e.stopPropagation()}
            className="hidden rounded-full bg-foreground/70 p-1 text-background shadow-sm hover:bg-foreground/90 group-hover:block"
          >
            <DownloadSimple size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload placeholder shown during upload
// ---------------------------------------------------------------------------

export function UploadingPlaceholder() {
  const t = useTranslations();
  return (
    <div className="flex h-[232px] w-[120px] shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20">
      <Spinner className="size-5 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{t("screenshots.uploading")}</span>
    </div>
  );
}
