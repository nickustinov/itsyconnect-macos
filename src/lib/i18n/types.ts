import type { en } from "./locales/en";

export type SupportedLocale = "en" | "zh-CN";

/** User-facing preference – "system" resolves against the OS locale. */
export type LocalePreference = "system" | "en" | "zh-CN";

type DeepStringMap<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringMap<T[K]>;
};

/** Message tree shape – leaf values are translated strings. */
export type Messages = DeepStringMap<typeof en>;

export const LOCALE_STORAGE_KEY = "itsyconnect-locale";

/** Resolved locale stored for SSR (en | zh-CN). */
export const LOCALE_COOKIE_KEY = "itsyconnect-locale-resolved";

/** Stored preference (system | en | zh-CN). */
export const LOCALE_PREF_COOKIE_KEY = "itsyconnect-locale-pref";

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ["en", "zh-CN"];
