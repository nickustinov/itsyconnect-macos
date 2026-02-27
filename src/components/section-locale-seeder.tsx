"use client";

import { useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { useLocalizations } from "@/lib/hooks/use-localizations";
import { useAppInfo, useAppInfoLocalizations } from "@/lib/hooks/use-app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import { resolveVersion } from "@/lib/asc/version-types";
import { sortLocales } from "@/lib/asc/locale-names";
import { useSeedSectionLocales } from "@/lib/section-locales-context";

/**
 * Mounts in the app layout and pre-seeds cross-section locale data
 * so the locale picker can show "used in X" suggestions on first load
 * without requiring the user to visit each section first.
 */
export function SectionLocaleSeeder() {
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const primaryLocale = app?.primaryLocale ?? "";

  const { versions } = useVersions();
  const selectedVersion = useMemo(
    () => resolveVersion(versions, searchParams.get("version")),
    [versions, searchParams],
  );
  const versionId = selectedVersion?.id ?? "";

  const { appInfos } = useAppInfo(appId);
  const appInfo = pickAppInfo(appInfos);
  const appInfoId = appInfo?.id ?? "";

  const { localizations: versionLocs } = useLocalizations(appId, versionId);
  const { localizations: detailLocs } = useAppInfoLocalizations(appId, appInfoId);

  const { seed, reset } = useSeedSectionLocales();

  // Reset all sections when version changes so seed() can repopulate
  const prevVersionIdRef = useRef(versionId);
  useEffect(() => {
    if (versionId && versionId !== prevVersionIdRef.current) {
      prevVersionIdRef.current = versionId;
      reset();
    }
  }, [versionId, reset]);

  useEffect(() => {
    if (!primaryLocale || versionLocs.length === 0) return;
    const locales = sortLocales(
      versionLocs.map((l) => l.attributes.locale),
      primaryLocale,
    );
    seed("store-listing", locales);
  }, [versionLocs, primaryLocale, seed]);

  useEffect(() => {
    if (!primaryLocale || detailLocs.length === 0) return;
    const locales = sortLocales(
      detailLocs.map((l) => l.attributes.locale),
      primaryLocale,
    );
    seed("details", locales);
  }, [detailLocs, primaryLocale, seed]);

  return null;
}
