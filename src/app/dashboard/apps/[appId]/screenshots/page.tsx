"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  CaretLeft,
  CaretRight,
  CloudArrowUp,
  DownloadSimple,
  Plus,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { resolveVersion, EDITABLE_STATES } from "@/lib/asc/version-types";
import { useLocalizations } from "@/lib/hooks/use-localizations";
import { useAppInfo } from "@/lib/hooks/use-app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import { useScreenshotSets } from "@/lib/hooks/use-screenshot-sets";
import { RemoveLocaleDialog } from "@/components/remove-locale-dialog";
import { localeName, sortLocales } from "@/lib/asc/locale-names";
import {
  screenshotImageUrl,
  screenshotErrorMessage,
  displayTypeLabel,
  sortDisplayTypes,
  DISPLAY_TYPE_SIZES,
  DEVICE_CATEGORY_TYPES,
  PLATFORM_DEVICE_CATEGORIES,
  getDeviceCategory,
  type DeviceCategory,
  type AscScreenshot,
  type AscScreenshotSet,
} from "@/lib/asc/display-types";
import { useRegisterHeaderLocale } from "@/lib/header-locale-context";
import { EmptyState } from "@/components/empty-state";
import { useLocaleManagement } from "@/lib/hooks/use-locale-management";
import { useScreenshotOperations } from "@/lib/hooks/use-screenshot-operations";

// ---------------------------------------------------------------------------
// Sortable screenshot thumbnail
// ---------------------------------------------------------------------------

function SortableScreenshot({
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

      {/* Download button */}
      {isComplete && hasToken && (
        <a
          href={`/api/screenshot-download?url=${encodeURIComponent(screenshotImageUrl(screenshot.attributes.assetToken!, 4000))}&name=${encodeURIComponent(screenshot.attributes.fileName)}`}
          download={screenshot.attributes.fileName}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-1 left-1 hidden rounded-full bg-foreground/70 p-1 text-background shadow-sm hover:bg-foreground/90 group-hover:block"
        >
          <DownloadSimple size={12} />
        </a>
      )}

      {/* Delete button */}
      {!readOnly && (
        deleting ? (
          <div className="absolute top-1 right-1 rounded-full bg-destructive p-1 text-white shadow-sm">
            <Spinner className="size-3" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onDelete(screenshot.id)}
            className="absolute top-1 right-1 hidden rounded-full bg-destructive p-1 text-white shadow-sm hover:bg-destructive/90 group-hover:block"
          >
            <X size={12} />
          </button>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload placeholder shown during upload
// ---------------------------------------------------------------------------

function UploadingPlaceholder() {
  return (
    <div className="flex h-[232px] w-[120px] shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20">
      <Spinner className="size-5 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">Uploading…</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screenshot set card
// ---------------------------------------------------------------------------

function ScreenshotSetCard({
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
            · {set.screenshots.length} screenshot
            {set.screenshots.length !== 1 ? "s" : ""}
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
              {dragOver ? "Drop to upload" : "No screenshots uploaded"}
            </p>
            {!readOnly && !dragOver && (
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                >
                  <Plus size={14} className="mr-1.5" />
                  Add screenshot
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => onDeleteSet(set.id)}
                >
                  Remove variant
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
                    <span className="text-xs">Add</span>
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
            <DialogTitle className="sr-only">Screenshot preview</DialogTitle>
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

// ---------------------------------------------------------------------------
// Device category tab bar
// ---------------------------------------------------------------------------

function DeviceCategoryTabs({
  categories,
  selected,
  onSelect,
}: {
  categories: DeviceCategory[];
  selected: DeviceCategory;
  onSelect: (cat: DeviceCategory) => void;
}) {
  return (
    <div className="border-b">
      <nav className="-mb-px flex">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => onSelect(cat)}
            className={cn(
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              cat === selected
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {cat}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add variant popover
// ---------------------------------------------------------------------------

function AddVariantButton({
  category,
  existingTypes,
  onAdd,
}: {
  category: DeviceCategory;
  existingTypes: Set<string>;
  onAdd: (displayType: string) => void;
}) {
  const available = DEVICE_CATEGORY_TYPES[category].filter(
    (dt) => !existingTypes.has(dt),
  );

  if (available.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {available.map((dt) => (
        <Button
          key={dt}
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => onAdd(dt)}
        >
          <Plus size={12} />
          {displayTypeLabel(dt)}
          {DISPLAY_TYPE_SIZES[dt] && (
            <span className="text-muted-foreground">{DISPLAY_TYPE_SIZES[dt]}</span>
          )}
        </Button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ScreenshotsPage() {
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { versions, loading: versionsLoading } = useVersions();

  const selectedVersion = useMemo(
    () => resolveVersion(versions, searchParams.get("version")),
    [versions, searchParams],
  );
  const versionId = selectedVersion?.id ?? "";
  const platform = selectedVersion?.attributes.platform ?? "IOS";

  const readOnly = selectedVersion
    ? !EDITABLE_STATES.has(selectedVersion.attributes.appVersionState)
    : false;

  const { localizations, loading: locLoading, refresh: refreshLocalizations } = useLocalizations(
    appId,
    versionId,
  );
  const { appInfos } = useAppInfo(appId);
  const appInfoId = useMemo(() => pickAppInfo(appInfos)?.id ?? "", [appInfos]);
  const primaryLocale = app?.primaryLocale ?? "";
  const [removeLocaleCode, setRemoveLocaleCode] = useState<string | null>(null);

  const {
    locales, setLocales,
    selectedLocale, setSelectedLocale,
    changeLocale,
    otherSectionLocales,
  } = useLocaleManagement({ section: "screenshots", primaryLocale });

  const versionLocales = useMemo(
    () => localizations.map((l) => l.attributes.locale),
    [localizations],
  );

  // Reset locale state when version changes
  const [prevVersionId, setPrevVersionId] = useState(versionId);
  if (versionId !== prevVersionId) {
    setPrevVersionId(versionId);
    if (primaryLocale) {
      setLocales([primaryLocale]);
      setSelectedLocale(primaryLocale);
    }
  }

  // Start with only the primary locale (initial mount)
  useEffect(() => {
    if (!primaryLocale) return;
    setLocales((prev) => {
      if (prev.length > 0) return prev;
      setSelectedLocale(primaryLocale);
      return [primaryLocale];
    });
  }, [primaryLocale]);

  const selectedLocalization = localizations.find(
    (l) => l.attributes.locale === selectedLocale,
  );
  const localizationId = selectedLocalization?.id ?? "";

  const {
    screenshotSets: rawSets,
    setScreenshotSets: setRawSets,
    loading: ssLoading,
    refresh,
  } = useScreenshotSets(appId, versionId, localizationId);

  // Sort sets by display type
  const screenshotSets = useMemo(() => {
    const sorted = sortDisplayTypes(
      rawSets.map((s) => s.attributes.screenshotDisplayType),
    );
    return sorted.map(
      (dt) => rawSets.find((s) => s.attributes.screenshotDisplayType === dt)!,
    );
  }, [rawSets]);

  // Device category tabs
  const allCategories = useMemo(
    () => PLATFORM_DEVICE_CATEGORIES[platform] ?? ["iPhone" as DeviceCategory],
    [platform],
  );

  const categoriesWithSets = useMemo(() => {
    const cats = new Set<DeviceCategory>();
    for (const set of screenshotSets) {
      const cat = getDeviceCategory(set.attributes.screenshotDisplayType);
      if (cat) cats.add(cat);
    }
    return cats;
  }, [screenshotSets]);

  // For editable versions, show all platform categories; for read-only, show only those with sets
  const visibleCategories = useMemo(() => {
    if (readOnly) {
      return allCategories.filter((c) => categoriesWithSets.has(c));
    }
    return allCategories;
  }, [readOnly, allCategories, categoriesWithSets]);

  const [selectedCategory, setSelectedCategory] = useState<DeviceCategory>(
    () => visibleCategories[0] ?? "iPhone",
  );

  // Reset selected category when visible categories change
  useEffect(() => {
    if (visibleCategories.length > 0 && !visibleCategories.includes(selectedCategory)) {
      setSelectedCategory(visibleCategories[0]);
    }
  }, [visibleCategories, selectedCategory]);

  // Filter sets by selected category
  const categoryTypes = useMemo(
    () => new Set(DEVICE_CATEGORY_TYPES[selectedCategory] ?? []),
    [selectedCategory],
  );

  const filteredSets = useMemo(
    () => screenshotSets.filter((s) => categoryTypes.has(s.attributes.screenshotDisplayType)),
    [screenshotSets, categoryTypes],
  );

  const existingTypes = useMemo(
    () => new Set(screenshotSets.map((s) => s.attributes.screenshotDisplayType)),
    [screenshotSets],
  );

  const hasAddableVariants = useMemo(
    () => DEVICE_CATEGORY_TYPES[selectedCategory]?.some((dt) => !existingTypes.has(dt)) ?? false,
    [selectedCategory, existingTypes],
  );

  // ---- Drag sensors ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Build the API base path
  const apiBase = `/api/apps/${appId}/versions/${versionId}/localizations/${localizationId}/screenshots`;

  const {
    uploadingSetIds,
    deletingIds,
    creatingVariant,
    handleUpload,
    handleDeleteScreenshot,
    handleDragEnd,
    handleAddVariant,
    handleDeleteSet,
  } = useScreenshotOperations({
    apiBase,
    localizationId,
    refresh,
    screenshotSets,
    setScreenshotSets: setRawSets,
  });

  async function createLocalization(locale: string) {
    const res = await fetch(
      `/api/apps/${appId}/versions/${versionId}/localizations`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locales: {
            [locale]: {
              description: "",
              keywords: "",
              whatsNew: "",
              promotionalText: "",
              supportUrl: "",
              marketingUrl: "",
            },
          },
          originalLocaleIds: {},
        }),
      },
    );
    const data = await res.json();
    if (!res.ok && !data.errors) throw new Error(data.error ?? "Failed");
  }

  async function handleAddLocale(locale: string) {
    setLocales((prev) => sortLocales([...prev, locale], primaryLocale));
    changeLocale(locale);
    if (!versionLocales.includes(locale)) {
      try {
        await createLocalization(locale);
        await refreshLocalizations();
        toast.success(`Added ${localeName(locale)}`);
      } catch {
        setLocales((prev) => prev.filter((l) => l !== locale));
        toast.error(`Failed to add ${localeName(locale)}`);
      }
    } else {
      toast.success(`Added ${localeName(locale)}`);
    }
  }

  async function handleBulkAddLocales(codes: string[]) {
    setLocales((prev) => {
      const combined = new Set([...prev, ...codes]);
      return sortLocales([...combined], primaryLocale);
    });
    const newCodes = codes.filter((c) => !versionLocales.includes(c));
    if (newCodes.length > 0) {
      try {
        await Promise.all(newCodes.map((c) => createLocalization(c)));
        await refreshLocalizations();
        toast.success(`Added ${codes.length} locales`);
      } catch {
        setLocales((prev) => prev.filter((l) => !newCodes.includes(l)));
        toast.error("Failed to add some locales");
      }
    } else {
      toast.success(`Added ${codes.length} locales`);
    }
  }

  // Register locale picker in the header bar
  useRegisterHeaderLocale({
    locales,
    selectedLocale,
    primaryLocale,
    onLocaleChange: changeLocale,
    onLocaleAdd: handleAddLocale,
    onLocalesAdd: handleBulkAddLocales,
    onLocaleDelete: (code: string) => setRemoveLocaleCode(code),
    section: "screenshots",
    otherSectionLocales,
    readOnly,
  });

  if (!app) {
    return <EmptyState title="App not found" />;
  }

  if (versionsLoading || locLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (locales.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        No localizations for this version.
      </div>
    );
  }

  if (ssLoading || creatingVariant) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  const showTabs = visibleCategories.length > 1 || (!readOnly && allCategories.length > 1);

  const isEmpty = filteredSets.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-6">
      {showTabs && (
        <DeviceCategoryTabs
          categories={readOnly ? visibleCategories : allCategories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />
      )}

      {isEmpty && readOnly ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No screenshots for {selectedCategory} on this version.
        </div>
      ) : isEmpty && !readOnly ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Add variant</p>
          <AddVariantButton
            category={selectedCategory}
            existingTypes={existingTypes}
            onAdd={handleAddVariant}
          />
        </div>
      ) : (
        <>
          <div className="space-y-6">
            {filteredSets.map((set) => (
              <ScreenshotSetCard
                key={set.id}
                set={set}
                readOnly={readOnly}
                uploading={uploadingSetIds.has(set.id)}
                deletingIds={deletingIds}
                sensors={sensors}
                onUpload={handleUpload}
                onDelete={handleDeleteScreenshot}
                onDeleteSet={handleDeleteSet}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>

          {!readOnly && hasAddableVariants && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Add variant</p>
              <AddVariantButton
                category={selectedCategory}
                existingTypes={existingTypes}
                onAdd={handleAddVariant}
              />
            </div>
          )}
        </>
      )}
      <RemoveLocaleDialog
        open={removeLocaleCode !== null}
        onOpenChange={(open) => { if (!open) setRemoveLocaleCode(null); }}
        locale={removeLocaleCode ?? ""}
        appId={appId}
        versionId={versionId}
        appInfoId={appInfoId}
        sections={{
          storeListing: otherSectionLocales["store-listing"]?.includes(removeLocaleCode ?? "") ?? false,
          appDetails: otherSectionLocales.details?.includes(removeLocaleCode ?? "") ?? false,
          screenshots: locales.includes(removeLocaleCode ?? ""),
        }}
        onRemoved={() => {
          if (removeLocaleCode === selectedLocale) {
            const remaining = locales.filter((l) => l !== removeLocaleCode);
            changeLocale(remaining[0] ?? primaryLocale);
          }
          refreshLocalizations();
        }}
      />
    </div>
  );
}
