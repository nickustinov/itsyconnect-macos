import type { LocalePreference, SupportedLocale } from "./types";
import { LOCALE_STORAGE_KEY } from "./types";

/**
 * Match a BCP 47 tag against supported app locales.
 * Returns null when no supported locale matches (caller should fall back to English).
 */
export function matchSupportedLocale(tag: string): SupportedLocale | null {
  const normalized = tag.trim().toLowerCase().replace(/_/g, "-");

  if (
    normalized === "zh-cn" ||
    normalized === "zh-hans" ||
    normalized === "zh-hans-cn" ||
    normalized === "zh"
  ) {
    return "zh-CN";
  }

  if (normalized.startsWith("en")) {
    return "en";
  }

  if (normalized.startsWith("zh")) {
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
  if (preference === "en") return "en";
  if (preference === "zh-CN") return "zh-CN";

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
    if (stored === "en" || stored === "zh-CN" || stored === "system") {
      return stored;
    }
  } catch {
    // ignore
  }
  return "system";
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

  if (typeof navigator !== "undefined") {
    if (navigator.languages?.length) {
      return navigator.languages.join(",");
    }
    if (navigator.language) return navigator.language;
  }

  return "en";
}
