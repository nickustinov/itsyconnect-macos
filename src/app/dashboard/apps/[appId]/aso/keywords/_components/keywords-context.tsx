"use client";

import { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-fetch";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import { useErrorReport } from "@/lib/error-report-context";
import { useChangeBuffer, useSectionBuffer } from "@/lib/change-buffer-context";
import { resolveVersion, TEXT_EDITABLE_STATES } from "@/lib/asc/version-types";
import { useLocalizations } from "@/lib/hooks/use-localizations";
import { useAppInfo, useAppInfoLocalizations } from "@/lib/hooks/use-app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import type { AscLocalization } from "@/lib/asc/localizations";
import type { AscAppInfoLocalization } from "@/lib/asc/app-info";
import type { SyncError } from "@/lib/api-helpers";
import type { StorefrontAnalysis } from "./keyword-analysis";
import { analyzeAllLocales } from "./keyword-analysis";
import { useTranslations } from "@/lib/i18n/locale-context";

interface KeywordsContextValue {
  app: { id: string; name: string; primaryLocale: string } | undefined;
  localizations: AscLocalization[];
  infoLocalizations: AscAppInfoLocalization[];
  editedLocalizations: AscLocalization[];
  localeAnalysis: StorefrontAnalysis | null;
  readOnly: boolean;
  versionState: string | null;
  loading: boolean;
  noVersions: boolean;
  handleKeywordsChange: (locale: string, keywords: string) => void;
  getTitle: (locale: string) => string | null;
  getSubtitle: (locale: string) => string | null;
  getDescription: (locale: string) => string;
}

const KeywordsContext = createContext<KeywordsContextValue | null>(null);

export function useKeywords() {
  const ctx = useContext(KeywordsContext);
  if (!ctx) throw new Error("useKeywords must be used within KeywordsProvider");
  return ctx;
}

export function KeywordsProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { versions, loading: versionsLoading } = useVersions();
  const { setDirty, registerSave, registerDiscard } = useFormDirty();
  const { showAscError, showSyncErrors } = useErrorReport();
  const { bufferEnabled } = useChangeBuffer();

  const selectedVersion = useMemo(
    () => resolveVersion(versions, searchParams.get("version")),
    [versions, searchParams],
  );
  const versionId = selectedVersion?.id ?? "";
  const { bufferedData, save: saveToBuffer, discard: discardBuffer } = useSectionBuffer(appId, "keywords", versionId);

  const readOnly = selectedVersion
    ? !TEXT_EDITABLE_STATES.has(selectedVersion.attributes.appVersionState)
    : false;

  const { localizations, loading: locLoading } = useLocalizations(appId, versionId);
  const { appInfos, loading: infoLoading } = useAppInfo(appId);
  const appInfo = useMemo(() => pickAppInfo(appInfos), [appInfos]);
  const { localizations: infoLocalizations, loading: infoLocLoading } =
    useAppInfoLocalizations(appId, appInfo?.id ?? "");

  // Editable keyword state per locale
  const [keywordEdits, setKeywordEdits] = useState<Record<string, string>>({});
  const originalKeywordsRef = useRef<Record<string, string>>({});
  const originalLocaleIdsRef = useRef<Record<string, string>>({});

  // Sync from server when localizations change
  const [prevLocalizations, setPrevLocalizations] = useState(localizations);
  if (localizations !== prevLocalizations) {
    setPrevLocalizations(localizations);
    const ascKw: Record<string, string> = {};
    const ids: Record<string, string> = {};
    for (const loc of localizations) {
      ascKw[loc.attributes.locale] = loc.attributes.keywords ?? "";
      ids[loc.attributes.locale] = loc.id;
    }
    // Merge buffered keyword edits on top of ASC data
    const bl = bufferEnabled ? bufferedData?.locales as Record<string, { keywords: string }> | undefined : undefined;
    const kw = bl ? { ...ascKw } : ascKw;
    if (bl) {
      for (const [locale, fields] of Object.entries(bl)) {
        if (locale in kw) kw[locale] = fields.keywords;
      }
    }
    setKeywordEdits(kw);
    if (!bufferEnabled) setDirty(false);
  }

  // Snapshot originals for save diffing (must be in effect, not render)
  useEffect(() => {
    const kw: Record<string, string> = {};
    const ids: Record<string, string> = {};
    for (const loc of localizations) {
      kw[loc.attributes.locale] = loc.attributes.keywords ?? "";
      ids[loc.attributes.locale] = loc.id;
    }
    originalKeywordsRef.current = kw;
    originalLocaleIdsRef.current = ids;
  }, [localizations]);

  function handleKeywordsChange(locale: string, keywords: string) {
    setKeywordEdits((prev) => ({ ...prev, [locale]: keywords }));
    setDirty(true);
  }

  // Overlay buffered keyword changes on initial load
  const bufferAppliedRef = useRef(false);
  useEffect(() => {
    if (!bufferEnabled) return;
    if (!bufferedData || bufferAppliedRef.current) return;
    bufferAppliedRef.current = true;
    const bl = bufferedData.locales as Record<string, { keywords: string }> | undefined;
    if (bl) {
      setKeywordEdits((prev) => {
        const next = { ...prev };
        for (const [locale, fields] of Object.entries(bl)) {
          next[locale] = fields.keywords;
        }
        return next;
      });
    }
  }, [bufferEnabled, bufferedData]);

  // Register save handler
  useEffect(() => {
    registerSave(async () => {
      if (bufferEnabled) {
        // --- Buffer save path ---
        const changed: Record<string, { keywords: string }> = {};
        const origChanged: Record<string, { keywords: string }> = {};
        for (const [locale, kw] of Object.entries(keywordEdits)) {
          if (kw !== originalKeywordsRef.current[locale]) {
            changed[locale] = { keywords: kw };
            origChanged[locale] = { keywords: originalKeywordsRef.current[locale] };
          }
        }
        if (Object.keys(changed).length === 0) {
          bufferAppliedRef.current = true;
          discardBuffer();
          setDirty(false);
          return;
        }
        bufferAppliedRef.current = true;
        saveToBuffer(
          { locales: changed },
          { locales: origChanged, localeIds: originalLocaleIdsRef.current },
        );
        toast.success(t("common.savedLocally"));
        setDirty(false);
        return;
      }

      // --- Direct ASC save path ---
      const changed: Record<string, { keywords: string }> = {};
      for (const [locale, kw] of Object.entries(keywordEdits)) {
        if (kw !== originalKeywordsRef.current[locale]) {
          changed[locale] = { keywords: kw };
        }
      }
      if (Object.keys(changed).length === 0) {
        setDirty(false);
        return;
      }
      try {
        const changedLocaleIds: Record<string, string> = {};
        for (const locale of Object.keys(changed)) {
          const id = originalLocaleIdsRef.current[locale];
          if (id) changedLocaleIds[locale] = id;
        }
        const res = await fetch(
          `/api/apps/${appId}/versions/${versionId}/localizations`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              locales: changed,
              originalLocaleIds: changedLocaleIds,
            }),
          },
        );
        const data = await res.json();
        if (!res.ok && !data.errors) throw new Error(data.error ?? t("common.saveFailed"));
        if (data.errors?.length > 0) {
          showSyncErrors(data.errors as SyncError[]);
          return;
        }
        toast.success(t("keywords.toastSaved"));
        originalKeywordsRef.current = { ...keywordEdits };
        setDirty(false);
      } catch (err) {
        if (err instanceof ApiError && err.ascErrors?.length) {
          showAscError({
            message: err.message,
            ascErrors: err.ascErrors,
            ascMethod: err.ascMethod,
            ascPath: err.ascPath,
          });
        } else {
          toast.error(err instanceof Error ? err.message : t("common.saveFailed"));
        }
      }
    });
  }, [appId, versionId, keywordEdits, bufferEnabled, registerSave, setDirty, showAscError, showSyncErrors, saveToBuffer, discardBuffer]);

  // Register discard handler
  useEffect(() => {
    registerDiscard(() => {
      setKeywordEdits({ ...originalKeywordsRef.current });
      if (bufferEnabled) {
        bufferAppliedRef.current = true;
        discardBuffer();
      }
    });
  }, [bufferEnabled, registerDiscard, discardBuffer]);

  const loading = versionsLoading || locLoading || infoLoading || infoLocLoading;

  const editedLocalizations = useMemo((): AscLocalization[] => {
    return localizations.map((loc) => ({
      ...loc,
      attributes: {
        ...loc.attributes,
        keywords: keywordEdits[loc.attributes.locale] ?? loc.attributes.keywords,
      },
    }));
  }, [localizations, keywordEdits]);

  const localeAnalysis = useMemo(() => {
    if (loading) return null;
    return analyzeAllLocales(editedLocalizations, infoLocalizations);
  }, [editedLocalizations, infoLocalizations, loading]);

  function getTitle(locale: string) {
    return infoLocalizations.find((l) => l.attributes.locale === locale)?.attributes.name ?? null;
  }

  function getSubtitle(locale: string) {
    return infoLocalizations.find((l) => l.attributes.locale === locale)?.attributes.subtitle ?? null;
  }

  function getDescription(locale: string) {
    return localizations.find((l) => l.attributes.locale === locale)?.attributes.description ?? "";
  }

  const versionState = selectedVersion?.attributes.appVersionState ?? null;

  const value = useMemo((): KeywordsContextValue => ({
    app: app ? { id: app.id, name: app.name, primaryLocale: app.primaryLocale } : undefined,
    localizations,
    infoLocalizations,
    editedLocalizations,
    localeAnalysis,
    readOnly,
    versionState,
    loading,
    noVersions: !loading && versions.length === 0,
    handleKeywordsChange,
    getTitle,
    getSubtitle,
    getDescription,
  }), [app, localizations, infoLocalizations, editedLocalizations, localeAnalysis, readOnly, versionState, loading, versions.length]);

  return (
    <KeywordsContext.Provider value={value}>
      {children}
    </KeywordsContext.Provider>
  );
}
