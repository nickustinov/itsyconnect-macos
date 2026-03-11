"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  useSectionLocales,
  type SectionName,
} from "@/lib/section-locales-context";

const STORAGE_KEY = "itsyconnect:selected-locale";

function getPersistedLocale(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function persistLocale(code: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, code);
  } catch { /* ignore */ }
}

interface UseLocaleManagementOptions {
  section: SectionName;
  primaryLocale: string;
}

export function useLocaleManagement({
  section,
  primaryLocale,
}: UseLocaleManagementOptions) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [locales, setLocales] = useState<string[]>([]);
  const [selectedLocale, setSelectedLocale] = useState(
    () => searchParams.get("locale") || getPersistedLocale() || "",
  );

  const changeLocale = useCallback(
    (code: string) => {
      setSelectedLocale(code);
      persistLocale(code);
      const next = new URLSearchParams(searchParams.toString());
      next.set("locale", code);
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [searchParams, router],
  );

  // Persist locale when set externally (e.g. from page effects)
  useEffect(() => {
    if (selectedLocale) persistLocale(selectedLocale);
  }, [selectedLocale]);

  const { reportLocales, otherSectionLocales } = useSectionLocales(section);

  // Report locales to cross-section context
  useEffect(() => {
    reportLocales(locales);
  }, [locales, reportLocales]);

  return {
    locales,
    setLocales,
    selectedLocale,
    setSelectedLocale,
    changeLocale,
    otherSectionLocales,
  };
}
