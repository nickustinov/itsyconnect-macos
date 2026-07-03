"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { resolveVersion, EDITABLE_STATES } from "@/lib/asc/version-types";
import { useLocalizations } from "@/lib/hooks/use-localizations";
import { useAppInfo } from "@/lib/hooks/use-app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import { useScreenshotSets } from "@/lib/hooks/use-screenshot-sets";
import { RemoveLocaleDialog } from "@/components/remove-locale-dialog";
import { sortLocales } from "@/lib/asc/locale-names";
import {
  sortDisplayTypes,
  DEVICE_CATEGORY_TYPES,
  PLATFORM_DEVICE_CATEGORIES,
  getDeviceCategory,
  type DeviceCategory,
} from "@/lib/asc/display-types";
import { useRegisterHeaderLocale } from "@/lib/header-locale-context";
import { useRegisterRefresh } from "@/lib/refresh-context";
import { EmptyState } from "@/components/empty-state";
import { useLocaleManagement } from "@/lib/hooks/use-locale-management";
import { useScreenshotOperations } from "@/lib/hooks/use-screenshot-operations";
import { useTranslations } from "@/lib/i18n/locale-context";

import { ScreenshotSetCard } from "./_components/screenshot-set-card";
import { DeviceCategoryTabs, AddVariantButton } from "./_components/device-category-tabs";
import { BaseLocaleScreenshots } from "./_components/base-locale-screenshots";

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ScreenshotsPage() {
  const t = useTranslations();
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
  } = useLocaleManagement({ section: "store-listing", primaryLocale });

  // Populate locale tabs from version localizations (same as store listing)
  useEffect(() => {
    if (!localizations.length || !primaryLocale) return;
    const sorted = sortLocales(localizations.map((l) => l.attributes.locale), primaryLocale);
    setLocales(sorted);
    setSelectedLocale((prev) => {
      if (prev && sorted.includes(prev)) return prev;
      return sorted[0] ?? "";
    });
  }, [localizations, primaryLocale]);

  const selectedLocalization = localizations.find(
    (l) => l.attributes.locale === selectedLocale,
  );
  const localizationId = selectedLocalization?.id ?? "";

  const primaryLocalizationId = useMemo(() => {
    return localizations.find((l) => l.attributes.locale === primaryLocale)?.id ?? "";
  }, [localizations, primaryLocale]);

  const {
    screenshotSets: rawSets,
    setScreenshotSets: setRawSets,
    loading: ssLoading,
    refresh,
  } = useScreenshotSets(appId, versionId, localizationId);

  // Track which locales have screenshots (for locale picker indicator)
  const [fetchedLocalesWithScreenshots, setFetchedLocalesWithScreenshots] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!localizations.length || !versionId) return;
    let cancelled = false;

    async function check() {
      const results = await Promise.all(
        localizations.map(async (loc) => {
          try {
            const res = await fetch(
              `/api/apps/${appId}/versions/${versionId}/localizations/${loc.id}/screenshots`,
            );
            if (!res.ok) return null;
            const data = await res.json();
            const sets = data.screenshotSets as Array<{ screenshots: unknown[] }>;
            const hasAny = sets?.some((s) => s.screenshots.length > 0);
            return hasAny ? loc.attributes.locale : null;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setFetchedLocalesWithScreenshots(new Set(results.filter(Boolean) as string[]));
    }

    check();
    return () => { cancelled = true; };
  }, [localizations, appId, versionId]);

  // Merge fetched locale data with current locale's live screenshot state
  const localesWithScreenshots = useMemo(() => {
    if (!selectedLocale) return fetchedLocalesWithScreenshots;
    const hasAny = rawSets.some((s) => s.screenshots.length > 0);
    const merged = new Set(fetchedLocalesWithScreenshots);
    if (hasAny) merged.add(selectedLocale);
    else merged.delete(selectedLocale);
    return merged;
  }, [fetchedLocalesWithScreenshots, rawSets, selectedLocale]);

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

  const [selectedCategoryRaw, setSelectedCategory] = useState<DeviceCategory>(
    () => visibleCategories[0] ?? "iPhone",
  );

  // Auto-select first visible category (derived, no effect needed)
  const selectedCategory = visibleCategories.length > 0 && !visibleCategories.includes(selectedCategoryRaw)
    ? visibleCategories[0]
    : selectedCategoryRaw;

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

  const handleRefresh = useCallback(() => refresh(), [refresh]);
  useRegisterRefresh({ onRefresh: handleRefresh, busy: ssLoading });

  // Register locale picker in the header bar
  useRegisterHeaderLocale({
    locales,
    selectedLocale,
    primaryLocale,
    onLocaleChange: changeLocale,
    section: "store-listing",
    otherSectionLocales,
    readOnly,
    localesWithContent: localesWithScreenshots,
  });

  if (!app) {
    return <EmptyState title={t("app.notFound")} />;
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
        {t("screenshots.noLocalizations")}
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

  const isBaseLocale = selectedLocale === primaryLocale;

  return (
    <div className="flex flex-1 flex-col gap-6">
      {!isBaseLocale && !readOnly && (
        <BaseLocaleScreenshots
          appId={appId}
          versionId={versionId}
          primaryLocale={primaryLocale}
          primaryLocalizationId={primaryLocalizationId}
          targetLocale={selectedLocale}
          targetLocalizationId={localizationId}
          targetSets={screenshotSets}
          onCopied={refresh}
        />
      )}

      {showTabs && (
        <DeviceCategoryTabs
          categories={readOnly ? visibleCategories : allCategories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />
      )}

      {isEmpty && readOnly ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t("screenshots.noScreenshotsOnVersion")}
        </div>
      ) : isEmpty && !readOnly ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("screenshots.addVariant")}</p>
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
              <p className="text-xs text-muted-foreground">{t("screenshots.addVariant")}</p>
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
