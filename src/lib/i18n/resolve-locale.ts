import type { LocalePreference, SupportedLocale } from "./types";
import { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from "./types";

/** Language subtags that map directly to a supported locale. */
const LANGUAGE_MAP: Record<string, SupportedLocale> = {
  en: "en",
  fr: "fr",
  de: "de",
  ru: "ru",
  ja: "ja",
};

/**
 * Match a BCP 47 tag against supported app locales.
 * Returns null when no supported locale matches (caller should fall back to English).
 */
export function matchSupportedLocale(tag: string): SupportedLocale | null {
  const normalized = tag.trim().toLowerCase().replace(/_/g, "-");
  const language = normalized.split("-")[0];

  const direct = LANGUAGE_MAP[language];
  if (direct) return direct;

  if (language === "zh") {
    // Traditional Chinese and regional variants have no dedicated locale – no match.
    if (
      normalized.includes("tw") ||
      normalized.includes("hk") ||
      normalized.includes("mo") ||
      normalized.includes("hant")
    ) {
      return null;
    }
    return "zh-CN";
  }

  return null;
}

/** Resolve the active locale from a stored preference and a system locale tag. */
export function resolveLocale(
  preference: LocalePreference,
  systemLocale: string,
): SupportedLocale {
  if (preference !== "system") return preference;

  const tags = systemLocale
    .split(",")
    .map((t) => t.split(";")[0]?.trim())
    .filter(Boolean);

  for (const tag of tags) {
    const matched = matchSupportedLocale(tag);
    if (matched) return matched;
  }

  return "en";
}

/** Read preference from localStorage (client only). */
export function readLocalePreference(): LocalePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (
      stored === "system" ||
      (SUPPORTED_LOCALES as readonly string[]).includes(stored ?? "")
    ) {
      return stored as LocalePreference;
    }
  } catch {
    // ignore
  }
  return "system";
}

/** Read the navigator locale tags synchronously (client only). */
export function readNavigatorLocale(): string {
  if (typeof navigator !== "undefined") {
    if (navigator.languages?.length) {
      return navigator.languages.join(",");
    }
    if (navigator.language) return navigator.language;
  }
  return "en";
}

/** Detect the system locale tag (Electron IPC when available, else navigator). */
export async function detectSystemLocale(): Promise<string> {
  if (typeof window !== "undefined" && window.electron?.getSystemLocale) {
    try {
      return await window.electron.getSystemLocale();
    } catch {
      // fall through
    }
  }

  return readNavigatorLocale();
}
