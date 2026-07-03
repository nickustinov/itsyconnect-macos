"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  detectSystemLocale,
  readLocalePreference,
  resolveLocale,
} from "./resolve-locale";
import { writeLocaleCookies } from "./locale-cookies";
import { getMessages, translate, type MessageKey } from "./messages";
import type { LocalePreference, Messages, SupportedLocale } from "./types";
import { LOCALE_STORAGE_KEY } from "./types";

/** In-memory override so setPreference updates before the next storage read. */
let preferenceOverride: LocalePreference | null = null;
let systemLocaleTag = "en";
let clientReady = false;
/** Locale frozen for SSR hydration – set from the server on each request. */
let frozenLocale: SupportedLocale = "en";
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);

  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCALE_STORAGE_KEY || e.key === null) {
      preferenceOverride = null;
      onStoreChange();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readPreference(): LocalePreference {
  if (preferenceOverride !== null) return preferenceOverride;
  return readLocalePreference();
}

function getSnapshot(): SupportedLocale {
  if (!clientReady) return frozenLocale;
  return resolveLocale(readPreference(), systemLocaleTag);
}

function getServerSnapshot(): SupportedLocale {
  return frozenLocale;
}

function scheduleClientActivation(onActivate: () => void) {
  // Defer until after all Suspense boundaries finish hydrating.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      onActivate();
    });
  });
}

interface LocaleContextValue {
  locale: SupportedLocale;
  preference: LocalePreference;
  messages: Messages;
  setPreference: (preference: LocalePreference) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  /** True after client hydration – safe to read browser-only preference state. */
  hydrated: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: SupportedLocale;
  children: React.ReactNode;
}) {
  frozenLocale = initialLocale;

  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    let cancelled = false;

    scheduleClientActivation(() => {
      if (cancelled) return;
      clientReady = true;
      emitChange();
      void detectSystemLocale().then((tag) => {
        if (cancelled) return;
        if (tag !== systemLocaleTag) {
          systemLocaleTag = tag;
        }
        const pref = readPreference();
        writeLocaleCookies(pref, resolveLocale(pref, systemLocaleTag));
        emitChange();
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const preference = hydrated ? readPreference() : "system";
  const messages = useMemo(() => getMessages(locale), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale === "zh-CN" ? "zh-CN" : "en";
  }, [locale]);

  const setPreference = useCallback((next: LocalePreference) => {
    preferenceOverride = next;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    const resolved = resolveLocale(next, systemLocaleTag);
    writeLocaleCookies(next, resolved);
    emitChange();
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) =>
      translate(messages, key, params),
    [messages],
  );

  const value = useMemo(
    () => ({ locale, preference, messages, setPreference, t, hydrated }),
    [locale, preference, messages, setPreference, t, hydrated],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}

export function useTranslations() {
  return useLocale().t;
}
