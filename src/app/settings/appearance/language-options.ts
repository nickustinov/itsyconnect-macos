"use client";

import { Globe, Monitor } from "@phosphor-icons/react";

/**
 * Language picker rows: the "system" preference followed by one row per
 * entry in SUPPORTED_LOCALES, in the same order. Kept outside page.tsx so the
 * list can be asserted against SUPPORTED_LOCALES in tests — a locale that is
 * registered but missing here is unreachable from the UI.
 */
export const LANGUAGE_OPTIONS = [
  { value: "system", labelKey: "settings.appearance.languageSystem" as const, icon: Monitor },
  { value: "en", labelKey: "settings.appearance.languageEn" as const, icon: Globe },
  { value: "zh-CN", labelKey: "settings.appearance.languageZhCN" as const, icon: Globe },
  { value: "fr", labelKey: "settings.appearance.languageFr" as const, icon: Globe },
  { value: "de", labelKey: "settings.appearance.languageDe" as const, icon: Globe },
  { value: "ru", labelKey: "settings.appearance.languageRu" as const, icon: Globe },
  { value: "ja", labelKey: "settings.appearance.languageJa" as const, icon: Globe },
] as const;
