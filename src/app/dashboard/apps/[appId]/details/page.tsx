"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Check } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-fetch";
import { useErrorReport } from "@/lib/error-report-context";
import type { SyncError } from "@/lib/api-helpers";
import { useApps } from "@/lib/apps-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import { useAppInfo, useAppInfoLocalizations } from "@/lib/hooks/use-app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import type { AscAppInfoLocalization } from "@/lib/asc/app-info";
import { localeName, sortLocales, FIELD_LIMITS, FIELD_MIN_LIMITS } from "@/lib/asc/locale-names";
import { CATEGORIES, categoryName } from "@/lib/asc/categories";
import { CharCount } from "@/components/char-count";
import { useRegisterHeaderLocale } from "@/lib/header-locale-context";
import { useLocaleManagement } from "@/lib/hooks/use-locale-management";
import { RemoveLocaleDialog } from "@/components/remove-locale-dialog";
import { apiFetch } from "@/lib/api-fetch";
import { useSubmissionChecklist } from "@/lib/submission-checklist-context";
import { computeAppDetailsFlags } from "@/lib/submission-checklist-utils";
import { MagicWandButton, wandProps } from "@/components/magic-wand-button";
import type { MagicWandLocaleProps } from "@/components/magic-wand-button";
import { BulkAIDialog, type BulkField } from "@/components/bulk-ai-dialog";
import { BulkAllAIDialog } from "@/components/bulk-all-ai-dialog";
import { AddLocaleDialog } from "@/components/add-locale-dialog";
import { EmptyState } from "@/components/empty-state";
import { useTabNavigation } from "@/lib/hooks/use-tab-navigation";
import { useRegisterRefresh } from "@/lib/refresh-context";
import { useVersions } from "@/lib/versions-context";
import { resolveVersion } from "@/lib/asc/version-types";

const SORTED_CATEGORIES = Object.keys(CATEGORIES).sort((a, b) =>
  CATEGORIES[a].localeCompare(CATEGORIES[b]),
);

type ContentRights = "DOES_NOT_USE_THIRD_PARTY_CONTENT" | "USES_THIRD_PARTY_CONTENT";

const AGE_RATING_LABELS: Record<string, string> = {
  FOUR_PLUS: "4+",
  NINE_PLUS: "9+",
  TWELVE_PLUS: "12+",
  SEVENTEEN_PLUS: "17+",
};

interface AppInfoLocaleFields {
  name: string;
  subtitle: string;
  privacyPolicyUrl: string;
  privacyChoicesUrl: string;
}

function emptyLocaleFields(): AppInfoLocaleFields {
  return {
    name: "",
    subtitle: "",
    privacyPolicyUrl: "",
    privacyChoicesUrl: "",
  };
}

function buildLocaleData(
  localizations: AscAppInfoLocalization[],
): Record<string, AppInfoLocaleFields> {
  const data: Record<string, AppInfoLocaleFields> = {};
  for (const loc of localizations) {
    data[loc.attributes.locale] = {
      name: loc.attributes.name ?? "",
      subtitle: loc.attributes.subtitle ?? "",
      privacyPolicyUrl: loc.attributes.privacyPolicyUrl ?? "",
      privacyChoicesUrl: loc.attributes.privacyChoicesUrl ?? "",
    };
  }
  return data;
}

export default function AppDetailsPage() {
  const tabRef = useTabNavigation();
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const { apps, updateApp } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { appInfos, loading: infoLoading, refresh: refreshAppInfo } = useAppInfo(appId);
  const appInfo = pickAppInfo(appInfos);
  const appInfoId = appInfo?.id ?? "";

  const { localizations, loading: locLoading, refresh: refreshLocalizations } =
    useAppInfoLocalizations(appId, appInfoId);

  const refreshLoading = infoLoading || locLoading;
  useRegisterRefresh({
    onRefresh: async () => {
      await refreshAppInfo();
      await refreshLocalizations();
    },
    busy: refreshLoading,
  });

  const { versions } = useVersions();
  const selectedVersion = useMemo(
    () => resolveVersion(versions, searchParams.get("version")),
    [versions, searchParams],
  );
  const versionId = selectedVersion?.id ?? "";

  const primaryLocale = app?.primaryLocale ?? "";

  const [localeData, setLocaleData] = useState<
    Record<string, AppInfoLocaleFields>
  >({});

  const {
    locales, setLocales,
    selectedLocale, setSelectedLocale,
    changeLocale,
    otherSectionLocales,
  } = useLocaleManagement({ section: "details", primaryLocale });

  const [contentRights, setContentRights] = useState<ContentRights>(
    (app?.contentRightsDeclaration as ContentRights) ?? "DOES_NOT_USE_THIRD_PARTY_CONTENT",
  );
  const contentRightsOriginalRef = useRef<ContentRights>(
    (app?.contentRightsDeclaration as ContentRights) ?? "DOES_NOT_USE_THIRD_PARTY_CONTENT",
  );

  const [primaryCategoryId, setPrimaryCategoryId] = useState("");
  const [secondaryCategoryId, setSecondaryCategoryId] = useState("");
  const primaryCategoryOriginalRef = useRef("");
  const secondaryCategoryOriginalRef = useRef("");

  const [notifUrl, setNotifUrl] = useState(app?.subscriptionStatusUrl ?? "");
  const [notifSandboxUrl, setNotifSandboxUrl] = useState(app?.subscriptionStatusUrlForSandbox ?? "");
  const notifUrlOriginalRef = useRef(app?.subscriptionStatusUrl ?? "");
  const notifSandboxUrlOriginalRef = useRef(app?.subscriptionStatusUrlForSandbox ?? "");

  const current = localeData[selectedLocale] ?? emptyLocaleFields();

  const wand: MagicWandLocaleProps = {
    locale: selectedLocale,
    baseLocale: locales[0] ?? "",
    localeData,
    appName: app?.name,
  };

  const { setDirty, registerSave, registerDiscard, setValidationErrors } = useFormDirty();
  const { showAscError, showSyncErrors } = useErrorReport();

  const bulkFields: BulkField[] = [
    { key: "name", label: "Name", charLimit: FIELD_LIMITS.name },
    { key: "subtitle", label: "Subtitle", charLimit: FIELD_LIMITS.subtitle },
  ];

  const [bulkMode, setBulkMode] = useState<"translate" | "copy" | null>(null);
  const [bulkAllMode, setBulkAllMode] = useState<{ mode: "translate" | "copy"; field?: string } | null>(null);
  const [addLocaleCode, setAddLocaleCode] = useState<string | null>(null);
  const [removeLocaleCode, setRemoveLocaleCode] = useState<string | null>(null);

  function handleBulkApply(updates: Record<string, Record<string, string>>) {
    setLocaleData((prev) => {
      const next = { ...prev };
      for (const [locale, fields] of Object.entries(updates)) {
        next[locale] = { ...next[locale], ...fields } as AppInfoLocaleFields;
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

  // Track original locale → localization ID mapping for diffing saves
  const originalLocaleIdsRef = useRef<Record<string, string>>({});

  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  useEffect(() => {
    const data = buildLocaleData(localizations);
    setLocaleData(data);
    const sorted = sortLocales(Object.keys(data), primaryLocale);
    setLocales(sorted);

    // Preserve current locale if still valid, else try URL param, else first
    setSelectedLocale((prev) => {
      if (prev && sorted.includes(prev)) return prev;
      const fromUrl = searchParamsRef.current.get("locale");
      if (fromUrl && sorted.includes(fromUrl)) return fromUrl;
      return sorted[0] ?? "";
    });
    setDirty(false);

    // Snapshot original locale → ID mapping for save diffing
    const ids: Record<string, string> = {};
    for (const loc of localizations) {
      ids[loc.attributes.locale] = loc.id;
    }
    originalLocaleIdsRef.current = ids;
  }, [localizations, primaryLocale, setDirty]);

  // Sync content rights when app data loads
  useEffect(() => {
    if (app?.contentRightsDeclaration) {
      const value = app.contentRightsDeclaration as ContentRights;
      setContentRights(value);
      contentRightsOriginalRef.current = value;
    }
  }, [app?.contentRightsDeclaration]);

  // Sync notification URLs when app data loads
  useEffect(() => {
    const prod = app?.subscriptionStatusUrl ?? "";
    const sandbox = app?.subscriptionStatusUrlForSandbox ?? "";
    setNotifUrl(prod);
    setNotifSandboxUrl(sandbox);
    notifUrlOriginalRef.current = prod;
    notifSandboxUrlOriginalRef.current = sandbox;
  }, [app?.subscriptionStatusUrl, app?.subscriptionStatusUrlForSandbox]);

  // Sync categories when appInfo loads
  useEffect(() => {
    if (appInfo) {
      const primary = appInfo.primaryCategory?.id ?? "";
      const secondary = appInfo.secondaryCategory?.id ?? "";
      setPrimaryCategoryId(primary);
      setSecondaryCategoryId(secondary);
      primaryCategoryOriginalRef.current = primary;
      secondaryCategoryOriginalRef.current = secondary;
    }
  }, [appInfo]);

  // Validate field limits across all locales
  useEffect(() => {
    const errors: string[] = [];
    for (const [locale, fields] of Object.entries(localeData)) {
      const lName = localeName(locale);
      if (fields.name.length > FIELD_LIMITS.name) {
        errors.push(`Name (${fields.name.length}/${FIELD_LIMITS.name}) in ${lName}`);
      }
      if (fields.name.length > 0 && fields.name.length < FIELD_MIN_LIMITS.name) {
        errors.push(`Name must be at least ${FIELD_MIN_LIMITS.name} characters in ${lName}`);
      }
      if (fields.subtitle.length > FIELD_LIMITS.subtitle) {
        errors.push(`Subtitle (${fields.subtitle.length}/${FIELD_LIMITS.subtitle}) in ${lName}`);
      }
    }
    setValidationErrors(errors);
  }, [localeData, setValidationErrors]);

  // Report submission checklist flags for app details fields
  const { reportAppDetails } = useSubmissionChecklist();
  useEffect(() => {
    if (!localeData[primaryLocale]) return;
    const mapped: Record<string, Record<string, string>> = {};
    for (const [locale, fields] of Object.entries(localeData)) {
      mapped[locale] = { ...fields };
    }
    reportAppDetails(computeAppDetailsFlags(mapped, primaryLocale));
  }, [localeData, primaryLocale, reportAppDetails]);

  // Register save handler for the header Save button
  useEffect(() => {
    registerSave(async () => {
      const promises: Promise<void>[] = [];

      // Save localizations
      let locCreatedIds: Record<string, string> = {};
      const syncErrors: SyncError[] = [];
      promises.push(
        fetch(`/api/apps/${appId}/info/${appInfoId}/localizations`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locales: localeData,
            originalLocaleIds: originalLocaleIdsRef.current,
          }),
        }).then(async (res) => {
          const data = await res.json();
          if (!res.ok && !data.errors) throw new Error(data.error ?? "Save failed");
          if (data.errors?.length > 0) {
            syncErrors.push(...(data.errors as SyncError[]));
          }
          locCreatedIds = data.createdIds ?? {};
        }),
      );

      // Save app attributes if changed (content rights + notification URLs)
      const appAttrs: Record<string, string | null> = {};
      if (contentRights !== contentRightsOriginalRef.current) {
        appAttrs.contentRightsDeclaration = contentRights;
      }
      if (notifUrl !== notifUrlOriginalRef.current) {
        appAttrs.subscriptionStatusUrl = notifUrl || null;
      }
      if (notifSandboxUrl !== notifSandboxUrlOriginalRef.current) {
        appAttrs.subscriptionStatusUrlForSandbox = notifSandboxUrl || null;
      }
      if (Object.keys(appAttrs).length > 0) {
        promises.push(
          apiFetch(`/api/apps/${appId}/attributes`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(appAttrs),
          }).then(() => {
            contentRightsOriginalRef.current = contentRights;
            notifUrlOriginalRef.current = notifUrl;
            notifSandboxUrlOriginalRef.current = notifSandboxUrl;
          }),
        );
      }

      // Save categories if changed
      if (
        primaryCategoryId !== primaryCategoryOriginalRef.current ||
        secondaryCategoryId !== secondaryCategoryOriginalRef.current
      ) {
        promises.push(
          apiFetch(`/api/apps/${appId}/info/${appInfoId}/categories`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              primaryCategoryId: primaryCategoryId || null,
              secondaryCategoryId: secondaryCategoryId || null,
            }),
          }).then(() => {
            primaryCategoryOriginalRef.current = primaryCategoryId;
            secondaryCategoryOriginalRef.current = secondaryCategoryId;
          }),
        );
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

      if (syncErrors.length > 0) {
        showSyncErrors(syncErrors);
        return;
      }

      toast.success("App details saved");

      // Update original snapshot with real IDs from created locales
      const ids: Record<string, string> = { ...originalLocaleIdsRef.current };
      for (const [locale, id] of Object.entries(locCreatedIds)) {
        ids[locale] = id;
      }
      for (const locale of Object.keys(ids)) {
        if (!localeData[locale]) delete ids[locale];
      }
      originalLocaleIdsRef.current = ids;

      // Update app name in context if primary locale name changed
      const primaryName = localeData[primaryLocale]?.name;
      if (primaryName && primaryName !== app?.name) {
        updateApp(appId, (a) => ({ ...a, name: primaryName }));
      }

      setDirty(false);
    });
  }, [appId, appInfoId, localeData, contentRights, primaryCategoryId, secondaryCategoryId, notifUrl, notifSandboxUrl, primaryLocale, app?.name, updateApp, registerSave, setDirty, showAscError, showSyncErrors]);

  // Register discard handler for the header Discard button
  useEffect(() => {
    registerDiscard(() => {
      setLocaleData(buildLocaleData(localizations));
      const sorted = sortLocales(
        localizations.map((l) => l.attributes.locale),
        primaryLocale,
      );
      setLocales(sorted);
      if (!sorted.includes(selectedLocale)) {
        changeLocale(sorted[0] ?? "");
      }
      setContentRights(contentRightsOriginalRef.current);
      setPrimaryCategoryId(primaryCategoryOriginalRef.current);
      setSecondaryCategoryId(secondaryCategoryOriginalRef.current);
      setNotifUrl(notifUrlOriginalRef.current);
      setNotifSandboxUrl(notifSandboxUrlOriginalRef.current);
    });
  }, [localizations, primaryLocale, selectedLocale, setLocales, changeLocale, registerDiscard]);

  const updateField = useCallback(
    (field: keyof AppInfoLocaleFields, value: string) => {
      setLocaleData((prev) => ({
        ...prev,
        [selectedLocale]: { ...prev[selectedLocale], [field]: value },
      }));
      setDirty(true);
    },
    [selectedLocale, setDirty],
  );

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
    section: "details",
    otherSectionLocales,
  });

  if (!app) {
    return <EmptyState title="App not found" />;
  }

  if (infoLoading || locLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  const ageRating = appInfo?.attributes.appStoreAgeRating;

  const localeTag = selectedLocale && selectedLocale !== primaryLocale
    ? <span className="ml-1.5 inline-flex translate-y-[-1px] rounded bg-muted px-1.5 py-0.5 align-middle text-[11px] font-normal text-muted-foreground">{selectedLocale}</span>
    : null;

  return (
    <div ref={tabRef} className="space-y-8">
      {/* Identifiers (read-only) */}
      <section className="space-y-2">
        <h3 className="section-title">Identifiers</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyField label="Bundle ID" value={app.bundleId} mono copyable />
          <ReadOnlyField label="SKU" value={app.sku} mono copyable />
        </div>
      </section>

      {/* Base language & App ID */}
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="space-y-2">
          <h3 className="section-title">Base language</h3>
          <Select defaultValue={app.primaryLocale}>
            <SelectTrigger className="w-[280px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {localizations.map((loc) => (
                <SelectItem
                  key={loc.attributes.locale}
                  value={loc.attributes.locale}
                >
                  {localeName(loc.attributes.locale)}
                  <span className="ml-1.5 text-muted-foreground">
                    {loc.attributes.locale}
                  </span>
                </SelectItem>
              ))}
              {localizations.length === 0 && (
                <SelectItem value={app.primaryLocale}>
                  {localeName(app.primaryLocale)}
                  <span className="ml-1.5 text-muted-foreground">
                    {app.primaryLocale}
                  </span>
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </section>
        <section className="space-y-2">
          <h3 className="section-title">App ID</h3>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium font-mono">{appId}</p>
            <CopyButton value={appId} />
          </div>
        </section>
      </div>

      {locales.length > 0 && (
        <>
          {/* Name & subtitle */}
          <section className="space-y-2">
            <h3 className="section-title">Name &amp; subtitle</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-muted-foreground">Name{localeTag}</label>
                  <CharCount value={current.name} limit={FIELD_LIMITS.name} min={FIELD_MIN_LIMITS.name} />
                </div>
                <Input
                  value={current.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <label className="text-sm text-muted-foreground">Subtitle{localeTag}</label>
                    <MagicWandButton
                      value={current.subtitle}
                      onChange={(v) => updateField("subtitle", v)}
                      {...wandProps(wand, "subtitle")}
                      charLimit={FIELD_LIMITS.subtitle}
                      onTranslateAll={() => setBulkAllMode({ mode: "translate", field: "subtitle" })}
                    />
                  </div>
                  <CharCount value={current.subtitle} limit={FIELD_LIMITS.subtitle} />
                </div>
                <Input
                  value={current.subtitle}
                  onChange={(e) => updateField("subtitle", e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
          </section>

          {/* URLs */}
          <section className="space-y-2">
            <h3 className="section-title">URLs</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  Privacy policy URL{localeTag}
                </label>
                <Input
                  dir="ltr"
                  value={current.privacyPolicyUrl}
                  onChange={(e) =>
                    updateField("privacyPolicyUrl", e.target.value)
                  }
                  placeholder="https://..."
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  Privacy choices URL{localeTag}
                </label>
                <Input
                  dir="ltr"
                  value={current.privacyChoicesUrl}
                  onChange={(e) =>
                    updateField("privacyChoicesUrl", e.target.value)
                  }
                  placeholder="https://..."
                  className="text-sm"
                />
              </div>
            </div>
          </section>
        </>
      )}

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
      <AddLocaleDialog
        open={addLocaleCode !== null}
        onOpenChange={(open) => { if (!open) setAddLocaleCode(null); }}
        locale={addLocaleCode ?? ""}
        appId={appId}
        primaryLocale={primaryLocale}
        appName={app?.name}
        versionId={versionId}
        appInfoId={appInfoId}
        onCreated={() => {
          refreshLocalizations();
          if (addLocaleCode) changeLocale(addLocaleCode);
        }}
      />
      <RemoveLocaleDialog
        open={removeLocaleCode !== null}
        onOpenChange={(open) => { if (!open) setRemoveLocaleCode(null); }}
        locale={removeLocaleCode ?? ""}
        appId={appId}
        versionId={versionId}
        appInfoId={appInfoId}
        sections={{
          storeListing: otherSectionLocales["store-listing"]?.includes(removeLocaleCode ?? "") ?? false,
          appDetails: locales.includes(removeLocaleCode ?? ""),
          screenshots: otherSectionLocales.screenshots?.includes(removeLocaleCode ?? "") ?? false,
        }}
        onRemoved={() => {
          if (removeLocaleCode === selectedLocale) {
            const remaining = locales.filter((l) => l !== removeLocaleCode);
            changeLocale(remaining[0] ?? primaryLocale);
          }
          refreshLocalizations();
        }}
      />

      {/* Categories */}
      <section className="space-y-2">
        <h3 className="section-title">Categories</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              Primary category
            </label>
            <Select
              value={primaryCategoryId}
              onValueChange={(value) => {
                setPrimaryCategoryId(value);
                if (value === secondaryCategoryId) setSecondaryCategoryId("");
                setDirty(true);
              }}
            >
              <SelectTrigger className="w-[280px] text-sm">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {SORTED_CATEGORIES.map((id) => (
                  <SelectItem key={id} value={id}>
                    {categoryName(id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              Secondary category
            </label>
            <Select
              value={secondaryCategoryId || "NONE"}
              onValueChange={(value) => {
                setSecondaryCategoryId(value === "NONE" ? "" : value);
                setDirty(true);
              }}
            >
              <SelectTrigger className="w-[280px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">None</SelectItem>
                {SORTED_CATEGORIES.filter((id) => id !== primaryCategoryId).map(
                  (id) => (
                    <SelectItem key={id} value={id}>
                      {categoryName(id)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Age rating */}
      <section className="space-y-2">
        <h3 className="section-title">Age rating</h3>
        <div className="flex gap-4">
          <Card className="w-32">
            <CardContent className="flex flex-col items-center justify-center py-4">
              <span className="text-2xl font-bold">
                {ageRating
                  ? (AGE_RATING_LABELS[ageRating] ?? ageRating)
                  : "–"}
              </span>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Content rights */}
      <section className="space-y-2">
        <h3 className="section-title">Content rights</h3>
        <RadioGroup
          value={contentRights}
          onValueChange={(value) => {
            setContentRights(value as ContentRights);
            setDirty(true);
          }}
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="DOES_NOT_USE_THIRD_PARTY_CONTENT" id="cr-none" />
            <Label htmlFor="cr-none" className="text-sm font-normal">
              Does not use third-party content
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="USES_THIRD_PARTY_CONTENT" id="cr-has-rights" />
            <Label htmlFor="cr-has-rights" className="text-sm font-normal">
              Contains third-party content and I have the necessary rights
            </Label>
          </div>
        </RadioGroup>
      </section>

      {/* App Store server notifications */}
      <section className="space-y-2 pb-8">
        <h3 className="section-title">App Store server notifications</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              Production URL
            </label>
            <Input
              dir="ltr"
              value={notifUrl}
              onChange={(e) => {
                setNotifUrl(e.target.value);
                setDirty(true);
              }}
              placeholder="https://..."
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              Sandbox URL
            </label>
            <Input
              dir="ltr"
              value={notifSandboxUrl}
              onChange={(e) => {
                setNotifSandboxUrl(e.target.value);
                setDirty(true);
              }}
              placeholder="https://..."
              className="text-sm"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function ReadOnlyField({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="space-y-1">
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
      <div className="flex items-center gap-1.5">
        <p className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>
          {value}
        </p>
        {copyable && <CopyButton value={value} />}
      </div>
    </div>
  );
}
