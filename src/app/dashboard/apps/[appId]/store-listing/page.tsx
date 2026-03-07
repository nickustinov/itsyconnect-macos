"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Lock } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-fetch";
import { useErrorReport } from "@/lib/error-report-context";
import type { SyncError } from "@/lib/api-helpers";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import { resolveVersion, EDITABLE_STATES, type AscVersion } from "@/lib/asc/version-types";
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
import { useSubmissionChecklist } from "@/lib/submission-checklist-context";
import { computeStoreListingFlags } from "@/lib/submission-checklist-utils";
import { useLocaleManagement } from "@/lib/hooks/use-locale-management";
import { useLocaleHandlers } from "@/lib/hooks/use-locale-handlers";
import type { MagicWandLocaleProps, CopyFromVersion } from "@/components/magic-wand-button";
import { BulkAIDialog, type BulkField } from "@/components/bulk-ai-dialog";
import { BulkAllAIDialog } from "@/components/bulk-all-ai-dialog";
import type { TFBuild } from "@/lib/asc/testflight/types";
import { type LocaleFields, emptyLocaleFields, LocaleFieldsSection } from "./_components/locale-fields";
import { VersionStringSection } from "./_components/version-string-section";
import { BuildSection } from "./_components/build-section";
import { ReleaseSettings } from "./_components/release-settings";
import { EmptyState } from "@/components/empty-state";
import { useTabNavigation } from "@/lib/hooks/use-tab-navigation";


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
  const tabRef = useTabNavigation();
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { versions, loading: versionsLoading, updateVersion } = useVersions();

  const selectedVersion = useMemo(
    () => resolveVersion(versions, searchParams.get("version")),
    [versions, searchParams],
  );
  const versionId = selectedVersion?.id ?? "";

  const readOnly = selectedVersion
    ? !EDITABLE_STATES.has(selectedVersion.attributes.appVersionState)
    : false;

  // No version has been distributed yet – "what's new" is not applicable
  const isFirstVersion = !versions.some((v) => v.attributes.appStoreState === "READY_FOR_SALE");

  const { localizations, loading: locLoading } = useLocalizations(appId, versionId);
  const { appInfos } = useAppInfo(appId);
  const appInfo = useMemo(() => pickAppInfo(appInfos), [appInfos]);
  const { localizations: infoLocalizations } = useAppInfoLocalizations(appId, appInfo?.id ?? "");

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
        toast.error("Failed to fetch version localizations");
        return;
      }
      const data = await res.json();
      const locs: { attributes: { locale: string; [key: string]: string } }[] =
        data.localizations ?? [];
      const match = locs.find((l) => l.attributes.locale === selectedLocale);
      if (!match) {
        toast.error("Locale not available in that version");
        return;
      }
      const value = match.attributes[field] ?? "";
      updateField(field as keyof LocaleFields, value);
      toast.success("Copied from version");
    } catch {
      toast.error("Failed to fetch version localizations");
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

  const bulkFields: BulkField[] = [
    { key: "description", label: "Description", charLimit: FIELD_LIMITS.description },
    { key: "keywords", label: "Keywords", charLimit: FIELD_LIMITS.keywords },
    ...(!isFirstVersion ? [{ key: "whatsNew", label: "What's new", charLimit: FIELD_LIMITS.whatsNew }] : []),
    { key: "promotionalText", label: "Promotional text", charLimit: FIELD_LIMITS.promotionalText },
  ];

  const [bulkMode, setBulkMode] = useState<"translate" | "copy" | null>(null);
  const [bulkAllMode, setBulkAllMode] = useState<{ mode: "translate" | "copy"; field?: string } | null>(null);

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
        ? "Translations applied to all locales"
        : "Copied to all locales",
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

  // Track original locale → localization ID mapping for diffing saves
  const originalLocaleIdsRef = useRef<Record<string, string>>({});

  // Reset locale data when localizations change (during render)
  const [prevLocalizations, setPrevLocalizations] = useState(localizations);
  if (localizations !== prevLocalizations) {
    setPrevLocalizations(localizations);
    const data = buildLocaleData(localizations);
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
    setDirty(false);
  }

  // Snapshot original locale → ID mapping for save diffing
  useEffect(() => {
    const ids: Record<string, string> = {};
    for (const loc of localizations) {
      ids[loc.attributes.locale] = loc.id;
    }
    originalLocaleIdsRef.current = ids;
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
      description: "Description",
      keywords: "Keywords",
      whatsNew: "What's new",
      promotionalText: "Promotional text",
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
    }
    setValidationErrors(errors);
  }, [localeData, isFirstVersion, setValidationErrors]);

  // Report submission checklist flags across all locales
  useEffect(() => {
    if (!localeData[primaryLocale]) return;
    reportStoreListing(computeStoreListingFlags(localeData, primaryLocale));
  }, [localeData, primaryLocale, reportStoreListing]);

  // Register save handler for the header Save button
  useEffect(() => {
    registerSave(async () => {
      const promises: Promise<void>[] = [];
      const allSyncErrors: SyncError[] = [];

      // When the version is read-only (live), only promotional text is
      // editable – send just that field to avoid ASC rejecting locked fields.
      // For the first-ever version, strip whatsNew – ASC rejects it.
      const locPayload = readOnly
        ? Object.fromEntries(
            Object.entries(localeData).map(([locale, fields]) => [
              locale,
              { promotionalText: fields.promotionalText },
            ]),
          )
        : isFirstVersion
          ? Object.fromEntries(
              Object.entries(localeData).map(([locale, { whatsNew: _, ...rest }]) => [
                locale,
                rest,
              ]),
            )
          : localeData;

      // Save localizations
      let locCreatedIds: Record<string, string> = {};
      promises.push(
        fetch(`/api/apps/${appId}/versions/${versionId}/localizations`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locales: locPayload,
            originalLocaleIds: originalLocaleIdsRef.current,
          }),
        }).then(async (res) => {
          const data = await res.json();
          if (!res.ok && !data.errors) throw new Error(data.error ?? "Save failed");
          if (data.errors?.length > 0) {
            allSyncErrors.push(...(data.errors as SyncError[]));
          }
          locCreatedIds = data.createdIds ?? {};
        }),
      );

      // Release settings are locked on live versions
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
            if (!res.ok && !data.errors) throw new Error(data.error ?? "Failed to save release settings");
            if (data.errors?.length > 0) {
              allSyncErrors.push(...(data.errors as SyncError[]));
            }
          }),
        );

        // Save build selection if changed (including removal)
        if (selectedBuildId !== originalBuildIdRef.current) {
          promises.push(
            apiFetch(`/api/apps/${appId}/versions/${versionId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ buildId: selectedBuildId }),
            }),
          );
        }

        // Save copyright if changed
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
          toast.error(err instanceof Error ? err.message : "Save failed");
        }
        return;
      }

      if (allSyncErrors.length > 0) {
        showSyncErrors(allSyncErrors);
        return;
      }

      toast.success(readOnly ? "Promotional text saved" : "Store listing saved");

      // Update original snapshot with real IDs from created locales
      const ids = { ...originalLocaleIdsRef.current };
      for (const [locale, id] of Object.entries(locCreatedIds)) {
        ids[locale] = id;
      }
      for (const locale of Object.keys(ids)) {
        if (!localeData[locale]) delete ids[locale];
      }
      originalLocaleIdsRef.current = ids;

      // Update cached version with release settings + build
      if (!readOnly && selectedVersion) {
        const ascReleaseType = releaseType === "manually"
          ? "MANUAL"
          : releaseType === "after-date"
            ? "SCHEDULED"
            : "AFTER_APPROVAL";
        const earliestReleaseDate = releaseType === "after-date" && scheduledDate
          ? scheduledDate.toISOString()
          : null;

        // Find selected build from allBuilds to update the cached version
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

        // Update original refs so subsequent discards reflect the saved state
        if (selectedBuildId !== originalBuildIdRef.current) {
          originalBuildIdRef.current = selectedBuildId;
        }
        if (copyright !== originalCopyrightRef.current) {
          originalCopyrightRef.current = copyright;
        }
      }

      setDirty(false);
    });
  }, [appId, versionId, localeData, readOnly, isFirstVersion, releaseType, scheduledDate, phasedRelease, selectedBuildId, copyright, allBuilds, selectedVersion, registerSave, setDirty, updateVersion, showAscError, showSyncErrors]);

  // Register discard handler for the header Discard button
  useEffect(() => {
    registerDiscard(() => {
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
    });
  }, [localizations, primaryLocale, selectedLocale, selectedVersion, setLocales, changeLocale, registerDiscard]);

  function updateField(field: keyof LocaleFields, value: string) {
    setLocaleData((prev) => ({
      ...prev,
      [selectedLocale]: { ...prev[selectedLocale], [field]: value },
    }));
    setDirty(true);
  }

  const { handleAddLocale, handleBulkAddLocales, handleDeleteLocale } = useLocaleHandlers({
    localeData,
    setLocaleData,
    setLocales,
    selectedLocale,
    changeLocale,
    primaryLocale,
    setDirty,
    emptyFields: emptyLocaleFields,
  });

  // Register locale picker in the header bar
  useRegisterHeaderLocale({
    locales,
    selectedLocale,
    primaryLocale,
    onLocaleChange: changeLocale,
    onLocaleAdd: handleAddLocale,
    onLocalesAdd: handleBulkAddLocales,
    onLocaleDelete: handleDeleteLocale,
    onBulkTranslate: () => setBulkMode("translate"),
    onBulkCopy: () => setBulkMode("copy"),
    onBulkTranslateAll: () => setBulkAllMode({ mode: "translate" }),
    onBulkCopyAll: () => setBulkAllMode({ mode: "copy" }),
    section: "store-listing",
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

  if (versions.length === 0) {
    return (
      <EmptyState
        title="No versions"
        description="Create a version to start editing your store listing."
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
          <ReadOnlyBanner state={selectedVersion.attributes.appVersionState} />
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
            No localizations for this version.
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
          <h3 className="section-title">Copyright</h3>
          <Input
            value={copyright}
            onChange={(e) => { setCopyright(e.target.value); setDirty(true); }}
            readOnly={readOnly}
            placeholder={`© ${new Date().getFullYear()} Your Company Name`}
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

const REVIEW_STATES = new Set(["WAITING_FOR_REVIEW", "IN_REVIEW"]);

function ReadOnlyBanner({ state }: { state: string }) {
  let message: string;
  if (REVIEW_STATES.has(state)) {
    message = "This version is in review – changes are locked until the review completes.";
  } else if (state === "PENDING_DEVELOPER_RELEASE") {
    message = "This version is approved and pending release – metadata is locked.";
  } else {
    message = "This version is live – only promotional text can be updated without a new review.";
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
      <Lock size={16} className="shrink-0" />
      {message}
    </div>
  );
}
