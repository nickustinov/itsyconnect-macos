"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  CloudArrowUp,
  Plus,
  SpinnerGap,
  X,
  DotsSixVertical,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import { resolveVersion, EDITABLE_STATES } from "@/lib/asc/version-types";
import { useLocalizations } from "@/lib/hooks/use-localizations";
import { useScreenshotSets } from "@/lib/hooks/use-screenshot-sets";
import { localeName, sortLocales } from "@/lib/asc/locale-names";
import {
  screenshotImageUrl,
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
import { useSectionLocales } from "@/lib/section-locales-context";
import { useRegisterHeaderLocale } from "@/lib/header-locale-context";

// ---------------------------------------------------------------------------
// Sortable screenshot thumbnail
// ---------------------------------------------------------------------------

function SortableScreenshot({
  screenshot,
  readOnly,
  onDelete,
}: {
  screenshot: AscScreenshot;
  readOnly: boolean;
  onDelete: (id: string) => void;
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

  const isComplete =
    screenshot.attributes.assetDeliveryState?.state === "COMPLETE";
  const hasToken = !!screenshot.attributes.assetToken;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative shrink-0"
    >
      {/* Drag handle + thumbnail */}
      <div
        className="flex flex-col items-center gap-1.5 rounded-lg border bg-muted/30 p-2"
        {...attributes}
        {...listeners}
      >
        {!readOnly && (
          <DotsSixVertical
            size={14}
            className="cursor-grab text-muted-foreground/40 group-hover:text-muted-foreground"
          />
        )}
        {isComplete && hasToken ? (
          <img
            src={screenshotImageUrl(screenshot.attributes.assetToken!, 300)}
            alt={screenshot.attributes.fileName}
            className="h-[200px] w-auto rounded object-contain"
            loading="lazy"
          />
        ) : (
          <div className="flex h-[200px] w-[112px] items-center justify-center rounded bg-muted">
            <SpinnerGap
              size={24}
              className="animate-spin text-muted-foreground/40"
            />
          </div>
        )}
        <p className="max-w-[120px] truncate text-xs text-muted-foreground">
          {screenshot.attributes.fileName}
        </p>
      </div>

      {/* Delete button */}
      {!readOnly && (
        <button
          type="button"
          onClick={() => onDelete(screenshot.id)}
          className="absolute -top-2 -right-2 hidden rounded-full bg-destructive p-1 text-destructive-foreground shadow-sm hover:bg-destructive/90 group-hover:block"
        >
          <X size={12} />
        </button>
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
      <SpinnerGap size={20} className="animate-spin text-muted-foreground" />
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
  sensors,
  onUpload,
  onDelete,
  onDeleteSet,
  onDragEnd,
}: {
  set: AscScreenshotSet;
  readOnly: boolean;
  uploading: boolean;
  sensors: ReturnType<typeof useSensors>;
  onUpload: (setId: string, file: File) => void;
  onDelete: (screenshotId: string) => void;
  onDeleteSet: (setId: string) => void;
  onDragEnd: (setId: string, event: DragEndEvent) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const displayType = set.attributes.screenshotDisplayType;
  const size = DISPLAY_TYPE_SIZES[displayType];

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
      <CardContent>
        {set.screenshots.length === 0 && !uploading ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
            <CloudArrowUp size={32} className="text-muted-foreground/40" />
            <p className="mt-2 text-sm text-muted-foreground">
              No screenshots uploaded
            </p>
            {!readOnly && (
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
                    onDelete={onDelete}
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
  const router = useRouter();
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
  const primaryLocale = app?.primaryLocale ?? "";
  const { setDirty, registerSave } = useFormDirty();
  const [pendingCreates, setPendingCreates] = useState<Set<string>>(new Set());

  const [locales, setLocales] = useState<string[]>([]);
  const [selectedLocale, setSelectedLocale] = useState(
    () => searchParams.get("locale") ?? "",
  );

  const changeLocale = useCallback(
    (code: string) => {
      setSelectedLocale(code);
      const next = new URLSearchParams(searchParams.toString());
      next.set("locale", code);
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [searchParams, router],
  );

  const { reportLocales, otherSectionLocales } = useSectionLocales("screenshots");

  // Only offer locales that have a version localization
  const versionLocales = useMemo(
    () => localizations.map((l) => l.attributes.locale),
    [localizations],
  );

  // Start with only the primary locale
  useEffect(() => {
    if (!primaryLocale) return;
    setLocales((prev) => {
      const current = prev.length > 0 ? prev : [primaryLocale];
      setSelectedLocale((prevSel) => {
        if (prevSel && current.includes(prevSel)) return prevSel;
        const fromUrl = searchParams.get("locale");
        if (fromUrl && current.includes(fromUrl)) return fromUrl;
        return primaryLocale;
      });
      return current;
    });
  }, [primaryLocale, searchParams]);

  // Report locales to cross-section context
  useEffect(() => {
    reportLocales(locales);
  }, [locales, reportLocales]);

  // Clear pending creates when localizations refresh
  useEffect(() => {
    setPendingCreates((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const locale of prev) {
        if (versionLocales.includes(locale)) next.delete(locale);
      }
      return next;
    });
  }, [versionLocales]);

  // Register save handler – creates version localizations for newly added locales
  useEffect(() => {
    registerSave(async () => {
      if (pendingCreates.size === 0) return;

      const localesPayload: Record<string, Record<string, string>> = {};
      for (const locale of pendingCreates) {
        localesPayload[locale] = {
          description: "",
          keywords: "",
          whatsNew: "",
          promotionalText: "",
          supportUrl: "",
          marketingUrl: "",
        };
      }

      const res = await fetch(
        `/api/apps/${appId}/versions/${versionId}/localizations`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locales: localesPayload, originalLocaleIds: {} }),
        },
      );

      const data = await res.json();
      if (!res.ok && !data.errors) {
        toast.error(data.error ?? "Failed to create localizations");
        return;
      }
      if (data.errors?.length > 0) {
        toast.warning(`Saved with ${data.errors.length} error(s)`);
      } else {
        toast.success("Localizations saved");
      }

      setPendingCreates(new Set());
      setDirty(false);
      await refreshLocalizations();
    });
  }, [appId, versionId, pendingCreates, registerSave, setDirty, refreshLocalizations]);

  const selectedLocalization = localizations.find(
    (l) => l.attributes.locale === selectedLocale,
  );
  const localizationId = selectedLocalization?.id ?? "";

  const {
    screenshotSets: rawSets,
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

  // ---- Upload state ----
  const [uploadingSetIds, setUploadingSetIds] = useState<Set<string>>(new Set());
  const [creatingVariant, setCreatingVariant] = useState(false);


  // ---- Drag sensors ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Build the API base path
  const apiBase = `/api/apps/${appId}/versions/${versionId}/localizations/${localizationId}/screenshots`;

  // ---- Handlers ----

  const handleUpload = useCallback(
    async (setId: string, file: File) => {
      setUploadingSetIds((prev) => new Set(prev).add(setId));
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("setId", setId);

        const res = await fetch(apiBase, { method: "POST", body: formData });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }
        toast.success("Screenshot uploaded");
        await refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to upload screenshot",
        );
      } finally {
        setUploadingSetIds((prev) => {
          const next = new Set(prev);
          next.delete(setId);
          return next;
        });
      }
    },
    [apiBase, refresh],
  );

  const handleDeleteScreenshot = useCallback(
    async (screenshotId: string) => {
      try {
        const res = await fetch(`${apiBase}/${screenshotId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Delete failed");
        }
        toast.success("Screenshot deleted");
        await refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to delete screenshot",
        );
      }
    },
    [apiBase, refresh],
  );

  const handleDragEnd = useCallback(
    async (setId: string, event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const set = screenshotSets.find((s) => s.id === setId);
      if (!set) return;

      const ids = set.screenshots.map((s) => s.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      const newOrder = arrayMove(ids, oldIndex, newIndex);

      try {
        const res = await fetch(`${apiBase}/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setId, screenshotIds: newOrder }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Reorder failed");
        }
        await refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to reorder screenshots",
        );
      }
    },
    [apiBase, refresh, screenshotSets],
  );

  const handleAddVariant = useCallback(
    async (displayType: string) => {
      if (!localizationId) return;
      setCreatingVariant(true);
      try {
        const res = await fetch(`${apiBase}/sets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayType }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Failed to create screenshot set");
          return;
        }
        toast.success(`Added ${displayTypeLabel(displayType)}`);
        await refresh();
      } catch {
        toast.error("Failed to create screenshot set");
      } finally {
        setCreatingVariant(false);
      }
    },
    [apiBase, localizationId, refresh],
  );

  const handleDeleteSet = useCallback(
    async (setId: string) => {
      try {
        const res = await fetch(`${apiBase}/sets`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setId }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Failed to remove variant");
          return;
        }
        toast.success("Variant removed");
        await refresh();
      } catch {
        toast.error("Failed to remove variant");
      }
    },
    [apiBase, refresh],
  );

  function handleAddLocale(locale: string) {
    setLocales((prev) => sortLocales([...prev, locale], primaryLocale));
    changeLocale(locale);
    if (!versionLocales.includes(locale)) {
      setPendingCreates((prev) => new Set(prev).add(locale));
      setDirty(true);
    }
    toast.success(`Added ${localeName(locale)}`);
  }

  function handleBulkAddLocales(codes: string[]) {
    setLocales((prev) => {
      const combined = new Set([...prev, ...codes]);
      return sortLocales([...combined], primaryLocale);
    });
    const newCodes = codes.filter((c) => !versionLocales.includes(c));
    if (newCodes.length > 0) {
      setPendingCreates((prev) => {
        const next = new Set(prev);
        for (const c of newCodes) next.add(c);
        return next;
      });
      setDirty(true);
    }
    toast.success(`Added ${codes.length} locales`);
  }

  function handleDeleteLocale(code: string) {
    setLocales((prev) => {
      const next = prev.filter((l) => l !== code);
      if (selectedLocale === code) {
        changeLocale(next[0] ?? "");
      }
      return next;
    });
    toast(`Removed ${localeName(code)}`, {
      action: {
        label: "Undo",
        onClick: () => {
          setLocales((prev) => sortLocales([...prev, code], primaryLocale));
        },
      },
    });
  }

  // Register locale picker in the header bar
  useRegisterHeaderLocale({
    locales,
    selectedLocale,
    primaryLocale,
    onLocaleChange: changeLocale,
    onLocaleAdd: handleAddLocale,
    onLocalesAdd: handleBulkAddLocales,
    onLocaleDelete: handleDeleteLocale,
    section: "screenshots",
    otherSectionLocales,
    readOnly,
  });

  if (!app) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        App not found
      </div>
    );
  }

  if (versionsLoading || locLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <SpinnerGap size={24} className="animate-spin text-muted-foreground" />
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
        <SpinnerGap size={24} className="animate-spin text-muted-foreground" />
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
    </div>
  );
}
