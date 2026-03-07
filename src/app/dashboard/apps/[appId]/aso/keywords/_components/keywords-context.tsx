"use client";

import { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-fetch";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import { useErrorReport } from "@/lib/error-report-context";
import { resolveVersion, EDITABLE_STATES } from "@/lib/asc/version-types";
import { useLocalizations } from "@/lib/hooks/use-localizations";
import { useAppInfo, useAppInfoLocalizations } from "@/lib/hooks/use-app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import type { AscLocalization } from "@/lib/asc/localizations";
import type { AscAppInfoLocalization } from "@/lib/asc/app-info";
import type { SyncError } from "@/lib/api-helpers";
import type { StorefrontAnalysis } from "./keyword-analysis";
import { analyzeAllLocales } from "./keyword-analysis";

interface KeywordsContextValue {
  app: { id: string; name: string; primaryLocale: string } | undefined;
  localizations: AscLocalization[];
  infoLocalizations: AscAppInfoLocalization[];
  editedLocalizations: AscLocalization[];
  localeAnalysis: StorefrontAnalysis | null;
  readOnly: boolean;
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
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { versions, loading: versionsLoading } = useVersions();
  const { setDirty, registerSave, registerDiscard } = useFormDirty();
  const { showAscError, showSyncErrors } = useErrorReport();

  const selectedVersion = useMemo(
    () => resolveVersion(versions, searchParams.get("version")),
    [versions, searchParams],
  );
  const versionId = selectedVersion?.id ?? "";

  const readOnly = selectedVersion
    ? !EDITABLE_STATES.has(selectedVersion.attributes.appVersionState)
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
    const kw: Record<string, string> = {};
    const ids: Record<string, string> = {};
    for (const loc of localizations) {
      kw[loc.attributes.locale] = loc.attributes.keywords ?? "";
      ids[loc.attributes.locale] = loc.id;
    }
    setKeywordEdits(kw);
    originalKeywordsRef.current = kw;
    originalLocaleIdsRef.current = ids;
    setDirty(false);
  }

  function handleKeywordsChange(locale: string, keywords: string) {
    setKeywordEdits((prev) => ({ ...prev, [locale]: keywords }));
    setDirty(true);
  }

  // Register save handler
  useEffect(() => {
    registerSave(async () => {
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
        // Only send changed locales + their IDs – never trigger creates or deletes
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
        if (!res.ok && !data.errors) throw new Error(data.error ?? "Save failed");
        if (data.errors?.length > 0) {
          showSyncErrors(data.errors as SyncError[]);
          return;
        }
        toast.success("Keywords saved");
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
          toast.error(err instanceof Error ? err.message : "Save failed");
        }
      }
    });
  }, [appId, versionId, keywordEdits, registerSave, setDirty, showAscError, showSyncErrors]);

  // Register discard handler
  useEffect(() => {
    registerDiscard(() => {
      setKeywordEdits({ ...originalKeywordsRef.current });
    });
  }, [registerDiscard]);

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

  const value = useMemo((): KeywordsContextValue => ({
    app: app ? { id: app.id, name: app.name, primaryLocale: app.primaryLocale } : undefined,
    localizations,
    infoLocalizations,
    editedLocalizations,
    localeAnalysis,
    readOnly,
    loading,
    noVersions: !loading && versions.length === 0,
    handleKeywordsChange,
    getTitle,
    getSubtitle,
    getDescription,
  }), [app, localizations, infoLocalizations, editedLocalizations, localeAnalysis, readOnly, loading, versions.length]);

  return (
    <KeywordsContext.Provider value={value}>
      {children}
    </KeywordsContext.Provider>
  );
}
