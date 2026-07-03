"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { ReadOnlyBanner } from "@/components/read-only-banner";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-fetch";
import { useErrorReport } from "@/lib/error-report-context";
import type { SyncError } from "@/lib/api-helpers";
import { useChangeBuffer } from "@/lib/change-buffer-context";
import { useSectionBuffer } from "@/lib/change-buffer-context";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import { resolveVersion, EDITABLE_STATES, TEXT_EDITABLE_STATES, type AscVersion } from "@/lib/asc/version-types";
import { useLocalizations } from "@/lib/hooks/use-localizations";
import { useAppInfo, useAppInfoLocalizations } from "@/lib/hooks/use-app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import type { AscLocalization } from "@/lib/asc/localizations";
import {
  localeName,
  sortLocales,
  FIELD_LIMITS,
  FIELD_MIN_LIMITS,
} from "@/lib/asc/locale-names";
import { useRegisterHeaderLocale } from "@/lib/header-locale-context";
import { useRegisterRefresh } from "@/lib/refresh-context";
import { useSubmissionChecklist } from "@/lib/submission-checklist-context";
import { computeStoreListingFlags } from "@/lib/submission-checklist-utils";
import { useLocaleManagement } from "@/lib/hooks/use-locale-management";
import type { MagicWandLocaleProps, CopyFromVersion } from "@/components/magic-wand-button";
import { BulkAIDialog, type BulkField } from "@/components/bulk-ai-dialog";
import { BulkAllAIDialog } from "@/components/bulk-all-ai-dialog";
import { AddLocaleDialog } from "@/components/add-locale-dialog";
import { RemoveLocaleDialog } from "@/components/remove-locale-dialog";
import type { TFBuild } from "@/lib/asc/testflight/types";
import { type LocaleFields, emptyLocaleFields, LocaleFieldsSection } from "./_components/locale-fields";
import { VersionStringSection } from "./_components/version-string-section";
import { BuildSection } from "./_components/build-section";
import { ReleaseSettings } from "./_components/release-settings";
import { EmptyState } from "@/components/empty-state";
import { useTabNavigation } from "@/lib/hooks/use-tab-navigation";
import { isValidUrl } from "@/lib/format";
import { useTranslations } from "@/lib/i18n/locale-context";

function deriveReleaseSettings(version: AscVersion | undefined) {
  if (!version) return { releaseType: "automatically" as const, scheduledDate: undefined as Date | undefined, phasedRelease: false };
  const { releaseType: rt, earliestReleaseDate } = version.attributes;
  if (rt === "SCHEDULED" || (rt === "AFTER_APPROVAL" && earliestReleaseDate)) {
    return {
      releaseType: "after-date" as const,
      scheduledDate: earliestReleaseDate ? new Date(earliestReleaseDate) : undefined,
      phasedRelease: version.phasedRelease != null,
    };
  }
  if (rt === "AFTER_APPROVAL" || rt == null) {
    return { releaseType: "automatically" as const, scheduledDate: undefined, phasedRelease: version.phasedRelease != null };
  }
  return { releaseType: "manually" as const, scheduledDate: undefined, phasedRelease: version.phasedRelease != null };
}

function buildLocaleData(
  localizations: AscLocalization[],
): Record<string, LocaleFields> {
  const data: Record<string, LocaleFields> = {};
  for (const loc of localizations) {
    data[loc.attributes.locale] = {
      description: loc.attributes.description ?? "",
      keywords: loc.attributes.keywords ?? "",
      whatsNew: loc.attributes.whatsNew ?? "",
      promotionalText: loc.attributes.promotionalText ?? "",
      supportUrl: loc.attributes.supportUrl ?? "",
      marketingUrl: loc.attributes.marketingUrl ?? "",
    };
  }
  return data;
}

export default function StoreListingPage() {
  const t = useTranslations();
  const tabRef = useTabNavigation();
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { versions, loading: versionsLoading, updateVersion, refresh: refreshVersions } = useVersions();

  const selectedVersion = useMemo(
    () => resolveVersion(versions, searchParams.get("version")),
    [versions, searchParams],
  );
  const versionId = selectedVersion?.id ?? "";

  const readOnly = selectedVersion
    ? !TEXT_EDITABLE_STATES.has(selectedVersion.attributes.appVersionState)
    : false;

  // Locale add/remove and screenshots blocked in WAITING_FOR_REVIEW
  const structuralReadOnly = selectedVersion
    ? !EDITABLE_STATES.has(selectedVersion.attributes.appVersionState)
    : false;

  // No version has been distributed on this platform yet – "what's new" is not applicable
  const isFirstVersion = !versions.some((v) =>
    v.attributes.platform === selectedVersion?.attributes.platform
    && v.attributes.appStoreState === "READY_FOR_SALE",
  );

  const { localizations, loading: locLoading, refresh: refreshLocalizations } = useLocalizations(appId, versionId);
  const { appInfos } = useAppInfo(appId);
  const appInfo = useMemo(() => pickAppInfo(appInfos), [appInfos]);
  const { localizations: infoLocalizations, loading: infoLocLoading, refresh: refreshInfoLocalizations } =
    useAppInfoLocalizations(appId, appInfo?.id ?? "");

  const appInfoData = useMemo(() => {
    const map: Record<string, { name?: string | null; subtitle?: string | null }> = {};
    for (const loc of infoLocalizations) {
      map[loc.attributes.locale] = {
        name: loc.attributes.name,
        subtitle: loc.attributes.subtitle,
      };
    }
    return map;
  }, [infoLocalizations]);

  useRegisterRefresh({
    onRefresh: async () => {
      await Promise.all([refreshVersions(), refreshLocalizations(), refreshInfoLocalizations()]);
    },
    busy: locLoading || infoLocLoading,
  });

  const primaryLocale = app?.primaryLocale ?? "";

  const [localeData, setLocaleData] = useState<Record<string, LocaleFields>>({});

  const {
    locales, setLocales,
    selectedLocale, setSelectedLocale,
    changeLocale,
    otherSectionLocales,
  } = useLocaleManagement({ section: "store-listing", primaryLocale });

  const current = localeData[selectedLocale] ?? emptyLocaleFields();

  const copyFromVersions: CopyFromVersion[] = useMemo(
    () =>
      versions
        .filter((v) => v.id !== versionId)
        .map((v) => ({
          versionId: v.id,
          versionString: v.attributes.versionString,
          platform: v.attributes.platform,
        })),
    [versions, versionId],
  );

  async function handleCopyFromVersion(field: string, sourceVersionId: string) {
    try {
      const res = await fetch(
        `/api/apps/${appId}/versions/${sourceVersionId}/localizations`,
      );
      if (!res.ok) {
        toast.error(t("storeListing.toast.fetchLocalesFailed"));
        return;
      }
      const data = await res.json();
      const locs: { attributes: { locale: string; [key: string]: string } }[] =
        data.localizations ?? [];

      if (field === "whatsNew") {
        const sourceMap = new Map(locs.map((l) => [l.attributes.locale, l.attributes[field] ?? ""]));
        let count = 0;
        setLocaleData((prev) => {
          const next = { ...prev };
          for (const locale of Object.keys(next)) {
            const value = sourceMap.get(locale);
            if (value !== undefined) {
              next[locale] = { ...next[locale], [field]: value };
              count++;
            }
          }
          return next;
        });
        setDirty(true);
        toast.success(t("storeListing.toast.copiedWhatsNew", { count }));
        return;
      }

      const match = locs.find((l) => l.attributes.locale === selectedLocale);
      if (!match) {
        toast.error(t("storeListing.toast.localeUnavailable"));
        return;
      }
      const value = match.attributes[field] ?? "";
      updateField(field as keyof LocaleFields, value);
      toast.success(t("storeListing.toast.copiedFromVersion"));
    } catch {
      toast.error(t("storeListing.toast.fetchLocalesFailed"));
    }
  }

  const wand: MagicWandLocaleProps = {
    locale: selectedLocale,
    baseLocale: locales[0] ?? "",
    localeData,
    appName: app?.name,
    appInfoData,
    copyFromVersions,
    onCopyFromVersion: handleCopyFromVersion,
  };

  const { reportStoreListing } = useSubmissionChecklist();
  const { setDirty, registerSave, registerDiscard, setValidationErrors } = useFormDirty();
  const { showAscError, showSyncErrors } = useErrorReport();
  const { bufferEnabled } = useChangeBuffer();
  const { bufferedData, save: saveToBuffer, discard: discardBuffer } = useSectionBuffer(appId, "store-listing", versionId);

  const bulkFields: BulkField[] = useMemo(() => [
    { key: "description", label: t("storeListing.fields.description"), charLimit: FIELD_LIMITS.description },
    { key: "keywords", label: t("storeListing.fields.keywords"), charLimit: FIELD_LIMITS.keywords },
    ...(!isFirstVersion ? [{ key: "whatsNew", label: t("storeListing.fields.whatsNew"), charLimit: FIELD_LIMITS.whatsNew }] : []),
    { key: "promotionalText", label: t("storeListing.fields.promotionalText"), charLimit: FIELD_LIMITS.promotionalText },
  ], [t, isFirstVersion]);

  const [bulkMode, setBulkMode] = useState<"translate" | "copy" | null>(null);
  const [bulkAllMode, setBulkAllMode] = useState<{ mode: "translate" | "copy"; field?: string } | null>(null);
  const [addLocaleCode, setAddLocaleCode] = useState<string | null>(null);
  const [removeLocaleCode, setRemoveLocaleCode] = useState<string | null>(null);

  function handleBulkApply(updates: Record<string, Record<string, string>>) {
    setLocaleData((prev) => {
      const next = { ...prev };
      for (const [locale, fields] of Object.entries(updates)) {
        next[locale] = { ...next[locale], ...fields } as LocaleFields;
      }
      return next;
    });
    setDirty(true);
    toast.success(
      bulkMode === "translate"
        ? t("storeListing.toast.translationsApplied")
        : t("storeListing.toast.copiedToAll"),
    );
  }
  // Copyright (version-level, not per-locale)
  const [copyright, setCopyright] = useState(selectedVersion?.attributes.copyright ?? "");
  const originalCopyrightRef = useRef(selectedVersion?.attributes.copyright ?? "");

  // Build picker state
  const [allBuilds, setAllBuilds] = useState<TFBuild[]>([]);
  const [selectedBuildId, setSelectedBuildId] = useState<string | null>(selectedVersion?.build?.id ?? null);
  const originalBuildIdRef = useRef<string | null>(selectedVersion?.build?.id ?? null);

  const platform = selectedVersion?.attributes.platform;
  const versionString = selectedVersion?.attributes.versionString;

  // Fetch builds for the picker, filtered by platform and version (lite mode skips group/metrics)
  const fetchBuilds = useCallback(
    async (refresh = false) => {
      if (!appId) return;
      const params = new URLSearchParams({ lite: "1" });
      if (refresh) params.set("refresh", "1");
      if (platform) params.set("platform", platform);
      if (versionString) params.set("version", versionString);
      try {
        const res = await fetch(`/api/apps/${appId}/testflight/builds?${params}`);
        const data = res.ok ? await res.json() : { builds: [] };
        setAllBuilds(data.builds ?? []);
      } catch {
        setAllBuilds([]);
      }
    },
    [appId, platform, versionString],
  );

  // Initial fetch when app/platform changes
  useEffect(() => {
    fetchBuilds();
  }, [fetchBuilds]);

  const derived = deriveReleaseSettings(selectedVersion);
  const [releaseType, setReleaseType] = useState<string>(derived.releaseType);
  const [scheduledDate, setScheduledDate] = useState(derived.scheduledDate);
  const [phasedRelease, setPhasedRelease] = useState(derived.phasedRelease);

  // Re-sync from server data when version switches or data refreshes
  const snapshotKey = `${versionId}:${selectedVersion?.attributes.releaseType}:${selectedVersion?.attributes.earliestReleaseDate}:${selectedVersion?.phasedRelease?.id ?? ""}:${selectedVersion?.build?.id ?? ""}:${selectedVersion?.attributes.copyright ?? ""}`;
  const [prevSnapshotKey, setPrevSnapshotKey] = useState(snapshotKey);
  if (snapshotKey !== prevSnapshotKey) {
    setPrevSnapshotKey(snapshotKey);
    if (bufferEnabled) {
      // Use buffered values if present, otherwise ASC values
      setReleaseType((bufferedData?.releaseType as string) ?? derived.releaseType);
      setScheduledDate(
        bufferedData?.scheduledDate !== undefined
          ? (bufferedData.scheduledDate ? new Date(bufferedData.scheduledDate as string) : undefined)
          : derived.scheduledDate,
      );
      setPhasedRelease((bufferedData?.phasedRelease as boolean) ?? derived.phasedRelease);
      const buildId = (bufferedData?.buildId !== undefined ? bufferedData.buildId : selectedVersion?.build?.id ?? null) as string | null;
      setSelectedBuildId(buildId);
      originalBuildIdRef.current = selectedVersion?.build?.id ?? null;
      const cr = (bufferedData?.copyright as string) ?? selectedVersion?.attributes.copyright ?? "";
      setCopyright(cr);
      originalCopyrightRef.current = selectedVersion?.attributes.copyright ?? "";
    } else {
      setReleaseType(derived.releaseType);
      setScheduledDate(derived.scheduledDate);
      setPhasedRelease(derived.phasedRelease);
      const buildId = selectedVersion?.build?.id ?? null;
      setSelectedBuildId(buildId);
      originalBuildIdRef.current = buildId;
      const cr = selectedVersion?.attributes.copyright ?? "";
      setCopyright(cr);
      originalCopyrightRef.current = cr;
    }
  }

  // Track original locale → localization ID mapping and data for diffing saves
  const originalLocaleIdsRef = useRef<Record<string, string>>({});
  const originalLocaleDataRef = useRef<Record<string, LocaleFields>>({});

  // Reset locale data when localizations change (during render)
  const [prevLocalizations, setPrevLocalizations] = useState(localizations);
  if (localizations !== prevLocalizations) {
    setPrevLocalizations(localizations);
    const ascData = buildLocaleData(localizations);

    // Merge with buffered locale changes if present
    const bl = bufferEnabled ? bufferedData?.locales as Record<string, Partial<LocaleFields>> | undefined : undefined;
    let data = ascData;
    if (bl) {
      data = { ...ascData };
      for (const [locale, fields] of Object.entries(bl)) {
        if (data[locale]) data[locale] = { ...data[locale], ...fields };
      }
    }

    setLocaleData(data);
    const sorted = sortLocales(Object.keys(data), primaryLocale);
    setLocales(sorted);

    // Preserve current locale if still valid, else try URL param, else first
    setSelectedLocale((prev) => {
      if (prev && sorted.includes(prev)) return prev;
      const fromUrl = searchParams.get("locale");
      if (fromUrl && sorted.includes(fromUrl)) return fromUrl;
      return sorted[0] ?? "";
    });
    if (!bufferEnabled) setDirty(false);
  }

  // Snapshot original locale IDs and data for save diffing
  useEffect(() => {
    const ids: Record<string, string> = {};
    for (const loc of localizations) {
      ids[loc.attributes.locale] = loc.id;
    }
    originalLocaleIdsRef.current = ids;
    originalLocaleDataRef.current = buildLocaleData(localizations);
  }, [localizations]);

  // Validate field limits across all locales
  useEffect(() => {
    const errors: string[] = [];
    const checked: [keyof LocaleFields, number][] = [
      ["description", FIELD_LIMITS.description],
      ["keywords", FIELD_LIMITS.keywords],
      ...(!isFirstVersion ? [["whatsNew", FIELD_LIMITS.whatsNew] as [keyof LocaleFields, number]] : []),
      ["promotionalText", FIELD_LIMITS.promotionalText],
    ];
    const fieldLabels: Record<string, string> = {
      description: t("storeListing.fields.description"),
      keywords: t("storeListing.fields.keywords"),
      whatsNew: t("storeListing.fields.whatsNew"),
      promotionalText: t("storeListing.fields.promotionalText"),
    };
    for (const [locale, fields] of Object.entries(localeData)) {
      const name = localeName(locale);
      for (const [field, limit] of checked) {
        const len = fields[field].length;
        if (len > limit) {
          errors.push(`${fieldLabels[field]} (${len}/${limit}) in ${name}`);
        }
        const min = FIELD_MIN_LIMITS[field];
        if (min && len > 0 && len < min) {
          errors.push(`${fieldLabels[field]} must be at least ${min} characters in ${name}`);
        }
      }
      // URL validation
      for (const urlField of ["supportUrl", "marketingUrl"] as const) {
        const val = fields[urlField];
        if (val && !isValidUrl(val)) {
          errors.push(
            urlField === "supportUrl"
              ? t("storeListing.toast.supportUrlInvalid", { locale: name })
              : t("storeListing.toast.marketingUrlInvalid", { locale: name }),
          );
        }
      }
    }
    setValidationErrors(errors);
  }, [localeData, isFirstVersion, setValidationErrors, t]);

  // Report submission checklist flags across all locales
  useEffect(() => {
    if (!localeData[primaryLocale]) return;
    reportStoreListing(computeStoreListingFlags(localeData, primaryLocale));
  }, [localeData, primaryLocale, reportStoreListing]);

  // When buffer loads after ASC data, re-apply overlay and mark dirty
  const bufferAppliedRef = useRef(false);
  useEffect(() => {
    if (!bufferEnabled) return;
    if (!bufferedData || bufferAppliedRef.current) return;
    bufferAppliedRef.current = true;
    const bl = bufferedData.locales as Record<string, Partial<LocaleFields>> | undefined;
    if (bl && Object.keys(localeData).length > 0) {
      setLocaleData((prev) => {
        const next = { ...prev };
        for (const [locale, fields] of Object.entries(bl)) {
          if (next[locale]) next[locale] = { ...next[locale], ...fields };
        }
        return next;
      });
    }
    if (bufferedData.copyright !== undefined) setCopyright(bufferedData.copyright as string);
    if (bufferedData.releaseType !== undefined) setReleaseType(bufferedData.releaseType as string);
    if (bufferedData.scheduledDate !== undefined) {
      const d = bufferedData.scheduledDate as string | null;
      setScheduledDate(d ? new Date(d) : undefined);
    }
    if (bufferedData.phasedRelease !== undefined) setPhasedRelease(bufferedData.phasedRelease as boolean);
    if (bufferedData.buildId !== undefined) setSelectedBuildId(bufferedData.buildId as string | null);
  }, [bufferEnabled, bufferedData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Register save handler for the header Save button
  useEffect(() => {
    registerSave(async () => {
      if (bufferEnabled) {
        // --- Buffer save path ---
        const data: Record<string, unknown> = {};
        const originalData: Record<string, unknown> = {
          localeIds: originalLocaleIdsRef.current,
          phasedReleaseId: selectedVersion?.phasedRelease?.id ?? null,
        };
        const orig = originalLocaleDataRef.current;

        // Locale diffs
        const localeChanges: Record<string, Record<string, string>> = {};
        const origLocaleChanges: Record<string, Record<string, string>> = {};
        for (const [locale, fields] of Object.entries(localeData)) {
          const origFields = orig[locale];
          if (!origFields) { localeChanges[locale] = { ...fields }; continue; }
          const diffs: Record<string, string> = {};
          const origDiffs: Record<string, string> = {};
          for (const [key, val] of Object.entries(fields)) {
            if (val === origFields[key as keyof LocaleFields]) continue;
            if (readOnly && key !== "promotionalText") continue;
            if (isFirstVersion && key === "whatsNew") continue;
            diffs[key] = val;
            origDiffs[key] = origFields[key as keyof LocaleFields];
          }
          if (Object.keys(diffs).length > 0) {
            localeChanges[locale] = diffs;
            origLocaleChanges[locale] = origDiffs;
          }
        }
        if (Object.keys(localeChanges).length > 0) {
          data.locales = localeChanges;
          originalData.locales = origLocaleChanges;
        }

        // Non-locale diffs
        if (!readOnly) {
          const origDerived = deriveReleaseSettings(selectedVersion);
          if (copyright !== originalCopyrightRef.current) {
            data.copyright = copyright;
            originalData.copyright = originalCopyrightRef.current;
          }
          if (releaseType !== origDerived.releaseType) {
            data.releaseType = releaseType;
            originalData.releaseType = origDerived.releaseType;
          }
          if (scheduledDate?.toISOString() !== origDerived.scheduledDate?.toISOString()) {
            data.scheduledDate = scheduledDate?.toISOString() ?? null;
            originalData.scheduledDate = origDerived.scheduledDate?.toISOString() ?? null;
          }
          if (phasedRelease !== origDerived.phasedRelease) {
            data.phasedRelease = phasedRelease;
            originalData.phasedRelease = origDerived.phasedRelease;
          }
          if (selectedBuildId !== originalBuildIdRef.current) {
            data.buildId = selectedBuildId;
            originalData.buildId = originalBuildIdRef.current;
          }
        }

        if (Object.keys(data).length === 0) {
          bufferAppliedRef.current = true;
          discardBuffer();
          setDirty(false);
          return;
        }

        bufferAppliedRef.current = true;
        saveToBuffer(data, originalData);
        toast.success(t("storeListing.toast.savedLocally"));
        setDirty(false);
        return;
      }

      // --- Direct ASC save path ---
      const promises: Promise<void>[] = [];
      const allSyncErrors: SyncError[] = [];

      // Only send locales that actually changed (or are new/deleted)
      const changedLocales: Record<string, LocaleFields | Record<string, string>> = {};
      const changedLocaleIds: Record<string, string> = {};
      const orig = originalLocaleDataRef.current;

      for (const [locale, fields] of Object.entries(localeData)) {
        const origFields = orig[locale];
        // New locale or any field differs → include it
        if (!origFields || Object.keys(fields).some((k) => fields[k as keyof LocaleFields] !== origFields[k as keyof LocaleFields])) {
          changedLocaleIds[locale] = originalLocaleIdsRef.current[locale];
          if (readOnly) {
            changedLocales[locale] = { promotionalText: fields.promotionalText };
          } else if (isFirstVersion) {
            changedLocales[locale] = Object.fromEntries(
              Object.entries(fields).filter(([k]) => k !== "whatsNew"),
            );
          } else {
            changedLocales[locale] = fields;
          }
        }
      }
      for (const locale of Object.keys(originalLocaleIdsRef.current)) {
        if (!localeData[locale]) {
          changedLocaleIds[locale] = originalLocaleIdsRef.current[locale];
        }
      }

      let locCreatedIds: Record<string, string> = {};
      if (Object.keys(changedLocales).length > 0 || Object.keys(changedLocaleIds).length > Object.keys(changedLocales).length) {
        promises.push(
          fetch(`/api/apps/${appId}/versions/${versionId}/localizations`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              locales: changedLocales,
              originalLocaleIds: changedLocaleIds,
            }),
          }).then(async (res) => {
            const data = await res.json();
            if (!res.ok && !data.errors) throw new Error(data.error ?? t("storeListing.toast.saveFailed"));
            if (data.errors?.length > 0) {
              allSyncErrors.push(...(data.errors as SyncError[]));
            }
            locCreatedIds = data.createdIds ?? {};
          }),
        );
      }

      if (!readOnly) {
        const ascReleaseType = releaseType === "manually"
          ? "MANUAL"
          : releaseType === "after-date"
            ? "SCHEDULED"
            : "AFTER_APPROVAL";
        const earliestReleaseDate = releaseType === "after-date" && scheduledDate
          ? scheduledDate.toISOString()
          : null;

        promises.push(
          fetch(`/api/apps/${appId}/versions/${versionId}/release`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              releaseType: ascReleaseType,
              earliestReleaseDate,
              phasedRelease,
              phasedReleaseId: selectedVersion?.phasedRelease?.id ?? null,
            }),
          }).then(async (res) => {
            const data = await res.json();
            if (!res.ok && !data.errors) throw new Error(data.error ?? t("storeListing.toast.releaseSettingsFailed"));
            if (data.errors?.length > 0) {
              allSyncErrors.push(...(data.errors as SyncError[]));
            }
          }),
        );

        if (selectedBuildId !== originalBuildIdRef.current) {
          promises.push(
            apiFetch(`/api/apps/${appId}/versions/${versionId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ buildId: selectedBuildId }),
            }),
          );
        }

        if (copyright !== originalCopyrightRef.current) {
          promises.push(
            apiFetch(`/api/apps/${appId}/versions/${versionId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ copyright }),
            }),
          );
        }
      }

      try {
        await Promise.all(promises);
      } catch (err) {
        if (err instanceof ApiError && err.ascErrors?.length) {
          showAscError({
            message: err.message,
            ascErrors: err.ascErrors,
            ascMethod: err.ascMethod,
            ascPath: err.ascPath,
          });
        } else {
          toast.error(err instanceof Error ? err.message : t("storeListing.toast.saveFailed"));
        }
        return;
      }

      if (allSyncErrors.length > 0) {
        showSyncErrors(allSyncErrors);
        return;
      }

      toast.success(readOnly ? t("storeListing.toast.promoSaved") : t("storeListing.toast.saved"));

      const ids = { ...originalLocaleIdsRef.current };
      for (const [locale, id] of Object.entries(locCreatedIds)) {
        ids[locale] = id;
      }
      for (const locale of Object.keys(ids)) {
        if (!localeData[locale]) delete ids[locale];
      }
      originalLocaleIdsRef.current = ids;
      originalLocaleDataRef.current = { ...localeData };

      if (!readOnly && selectedVersion) {
        const ascReleaseType = releaseType === "manually"
          ? "MANUAL"
          : releaseType === "after-date"
            ? "SCHEDULED"
            : "AFTER_APPROVAL";
        const earliestReleaseDate = releaseType === "after-date" && scheduledDate
          ? scheduledDate.toISOString()
          : null;

        const newBuild = selectedBuildId
          ? allBuilds.find((b) => b.id === selectedBuildId) ?? null
          : null;

        updateVersion(selectedVersion.id, (v) => ({
          ...v,
          attributes: {
            ...v.attributes,
            releaseType: ascReleaseType,
            earliestReleaseDate,
            copyright,
          },
          build: newBuild
            ? {
                id: newBuild.id,
                attributes: {
                  version: newBuild.buildNumber,
                  uploadedDate: newBuild.uploadedDate,
                  processingState: "VALID",
                  minOsVersion: newBuild.minOsVersion,
                  iconAssetToken: null,
                },
              }
            : selectedBuildId === null ? null : v.build,
          phasedRelease: phasedRelease
            ? (v.phasedRelease ?? { id: "", attributes: { phasedReleaseState: "INACTIVE", currentDayNumber: null, startDate: null } })
            : null,
        }));

        if (selectedBuildId !== originalBuildIdRef.current) {
          originalBuildIdRef.current = selectedBuildId;
        }
        if (copyright !== originalCopyrightRef.current) {
          originalCopyrightRef.current = copyright;
        }
      }

      setDirty(false);
    });
  }, [appId, versionId, localeData, readOnly, isFirstVersion, releaseType, scheduledDate, phasedRelease, selectedBuildId, copyright, allBuilds, selectedVersion, bufferEnabled, registerSave, setDirty, updateVersion, showAscError, showSyncErrors, saveToBuffer, discardBuffer, bufferedData]);

  // Register discard handler for the header Discard button
  useEffect(() => {
    registerDiscard(() => {
      if (bufferEnabled) {
        const ascData = buildLocaleData(localizations);
        const bl = bufferedData?.locales as Record<string, Partial<LocaleFields>> | undefined;
        let data = ascData;
        if (bl) {
          data = { ...ascData };
          for (const [locale, fields] of Object.entries(bl)) {
            if (data[locale]) data[locale] = { ...data[locale], ...fields };
          }
        }
        setLocaleData(data);
        const sorted = sortLocales(Object.keys(data), primaryLocale);
        setLocales(sorted);
        if (!sorted.includes(selectedLocale)) {
          changeLocale(sorted[0] ?? "");
        }
        const reset = deriveReleaseSettings(selectedVersion);
        setReleaseType((bufferedData?.releaseType as string) ?? reset.releaseType);
        setScheduledDate(
          bufferedData?.scheduledDate !== undefined
            ? (bufferedData.scheduledDate ? new Date(bufferedData.scheduledDate as string) : undefined)
            : reset.scheduledDate,
        );
        setPhasedRelease((bufferedData?.phasedRelease as boolean) ?? reset.phasedRelease);
        setSelectedBuildId(
          (bufferedData?.buildId !== undefined ? bufferedData.buildId : originalBuildIdRef.current) as string | null,
        );
        setCopyright((bufferedData?.copyright as string) ?? originalCopyrightRef.current);
      } else {
        setLocaleData(buildLocaleData(localizations));
        const sorted = sortLocales(localizations.map((l) => l.attributes.locale), primaryLocale);
        setLocales(sorted);
        if (!sorted.includes(selectedLocale)) {
          changeLocale(sorted[0] ?? "");
        }
        const reset = deriveReleaseSettings(selectedVersion);
        setReleaseType(reset.releaseType);
        setScheduledDate(reset.scheduledDate);
        setPhasedRelease(reset.phasedRelease);
        setSelectedBuildId(originalBuildIdRef.current);
        setCopyright(originalCopyrightRef.current);
      }
    });
  }, [localizations, primaryLocale, selectedLocale, selectedVersion, bufferEnabled, bufferedData, setLocales, changeLocale, registerDiscard]);

  function updateField(field: keyof LocaleFields, value: string) {
    setLocaleData((prev) => ({
      ...prev,
      [selectedLocale]: { ...prev[selectedLocale], [field]: value },
    }));
    setDirty(true);
  }

  // Register locale picker in the header bar
  useRegisterHeaderLocale({
    locales,
    selectedLocale,
    primaryLocale,
    onLocaleChange: changeLocale,
    onLocaleAdd: (code: string) => setAddLocaleCode(code),
    onLocaleDelete: (code: string) => setRemoveLocaleCode(code),
    onBulkTranslate: () => setBulkMode("translate"),
    onBulkCopy: () => setBulkMode("copy"),
    onBulkTranslateAll: () => setBulkAllMode({ mode: "translate" }),
    onBulkCopyAll: () => setBulkAllMode({ mode: "copy" }),
    section: "store-listing",
    otherSectionLocales,
    readOnly: structuralReadOnly,
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

  if (versions.length === 0) {
    return (
      <EmptyState
        title={t("storeListing.noVersions")}
        description={t("storeListing.noVersionsDescription")}
      />
    );
  }

  const localeTag = selectedLocale && selectedLocale !== primaryLocale
    ? <span className="ml-1.5 inline-flex translate-y-[-1px] rounded bg-muted px-1.5 py-0.5 align-middle text-[11px] font-normal text-muted-foreground">{selectedLocale}</span>
    : null;

  return (
    <div ref={tabRef} className="space-y-6">
        {/* Read-only banner */}
        {readOnly && selectedVersion && (
          <ReadOnlyBanner
            state={selectedVersion.attributes.appVersionState}
            liveMessage={t("storeListing.readOnlyPromoOnly")}
          />
        )}

        {/* Version string */}
        <VersionStringSection
          appId={appId}
          version={selectedVersion}
          readOnly={readOnly}
          onUpdated={(newString) => {
            if (!selectedVersion) return;
            updateVersion(selectedVersion.id, (v) => ({
              ...v,
              attributes: { ...v.attributes, versionString: newString },
            }));
          }}
        />

        {locales.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t("storeListing.noLocalizations")}
          </div>
        ) : (
          <LocaleFieldsSection
            current={current}
            localeTag={localeTag}
            readOnly={readOnly}
            onFieldChange={updateField}
            wand={wand}
            onBulkAllMode={(field) => setBulkAllMode({ mode: "translate", field })}
            hideWhatsNew={isFirstVersion}
            keywordsInsightsHref={`/dashboard/apps/${appId}/aso/keywords`}
          />
        )}

        {/* Copyright (version-level, not per-locale) */}
        <section className="space-y-2">
          <h3 className="section-title">{t("storeListing.copyright")}</h3>
          <Input
            value={copyright}
            onChange={(e) => { setCopyright(e.target.value); setDirty(true); }}
            readOnly={readOnly}
            placeholder={t("storeListing.copyrightPlaceholder", { year: new Date().getFullYear() })}
            className="text-sm"
          />
        </section>

        {/* Build */}
        <BuildSection
          allBuilds={allBuilds}
          selectedBuildId={selectedBuildId}
          versionBuild={selectedVersion?.build ?? null}
          versionString={selectedVersion?.attributes.versionString}
          onBuildChange={(id) => { setSelectedBuildId(id); setDirty(true); }}
          onBuildRemove={() => { setSelectedBuildId(null); setDirty(true); }}
          onRefresh={async () => fetchBuilds(true)}
          readOnly={readOnly}
        />

        <BulkAIDialog
          open={bulkMode !== null}
          onOpenChange={(open) => { if (!open) setBulkMode(null); }}
          mode={bulkMode ?? "copy"}
          targetLocale={selectedLocale}
          primaryLocale={primaryLocale}
          localeData={localeData}
          fields={bulkFields}
          appName={app?.name}
          onApply={handleBulkApply}
        />
        <BulkAllAIDialog
          open={bulkAllMode !== null}
          onOpenChange={(open) => { if (!open) setBulkAllMode(null); }}
          mode={bulkAllMode?.mode ?? "copy"}
          primaryLocale={primaryLocale}
          locales={locales}
          localeData={localeData}
          fields={bulkAllMode?.field ? bulkFields.filter((f) => f.key === bulkAllMode.field) : bulkFields}
          appName={app?.name}
          onApply={handleBulkApply}
        />
        <RemoveLocaleDialog
          open={removeLocaleCode !== null}
          onOpenChange={(open) => { if (!open) setRemoveLocaleCode(null); }}
          locale={removeLocaleCode ?? ""}
          appId={appId}
          versionId={versionId}
          appInfoId={appInfo?.id ?? ""}
          onRemoved={() => {
            // Switch away from the deleted locale before refreshing
            if (removeLocaleCode === selectedLocale) {
              const remaining = locales.filter((l) => l !== removeLocaleCode);
              changeLocale(remaining[0] ?? primaryLocale);
            }
            refreshLocalizations();
            refreshInfoLocalizations();
          }}
        />
        <AddLocaleDialog
          open={addLocaleCode !== null}
          onOpenChange={(open) => { if (!open) setAddLocaleCode(null); }}
          locale={addLocaleCode ?? ""}
          appId={appId}
          primaryLocale={primaryLocale}
          appName={app?.name}
          versionId={versionId}
          appInfoId={appInfo?.id ?? ""}
          isFirstVersion={isFirstVersion}
          onCreated={() => {
            refreshLocalizations();
            if (addLocaleCode) changeLocale(addLocaleCode);
          }}
        />

        {/* Release settings */}
        <ReleaseSettings
          releaseType={releaseType}
          onReleaseTypeChange={(v) => { setReleaseType(v); setDirty(true); }}
          scheduledDate={scheduledDate}
          onScheduledDateChange={(d) => { setScheduledDate(d); setDirty(true); }}
          phasedRelease={phasedRelease}
          onPhasedReleaseChange={(v) => { setPhasedRelease(v); setDirty(true); }}
          readOnly={readOnly}
        />
    </div>
  );
}

