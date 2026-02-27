"use client";

import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useSyncExternalStore,
} from "react";

export type SectionName = "store-listing" | "details" | "screenshots";

type Store = Record<SectionName, string[]>;

interface SectionLocalesContextValue {
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => Store;
  report: (section: SectionName, locales: string[]) => void;
  /** Like report, but only sets data if the section is still empty. */
  seed: (section: SectionName, locales: string[]) => void;
  /** Clear all sections so seed() can repopulate (e.g. on version change). */
  reset: () => void;
}

const SectionLocalesContext = createContext<SectionLocalesContextValue | null>(
  null,
);

export function SectionLocalesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const storeRef = useRef<Store>({
    "store-listing": [],
    details: [],
    screenshots: [],
  });
  const listenersRef = useRef(new Set<() => void>());

  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => listenersRef.current.delete(cb);
  }, []);

  const getSnapshot = useCallback(() => storeRef.current, []);

  const report = useCallback((section: SectionName, locales: string[]) => {
    const prev = storeRef.current[section];
    if (
      prev.length === locales.length &&
      prev.every((l, i) => l === locales[i])
    ) {
      return;
    }
    storeRef.current = { ...storeRef.current, [section]: locales };
    listenersRef.current.forEach((cb) => cb());
  }, []);

  const seed = useCallback((section: SectionName, locales: string[]) => {
    if (storeRef.current[section].length > 0) return;
    storeRef.current = { ...storeRef.current, [section]: locales };
    listenersRef.current.forEach((cb) => cb());
  }, []);

  const reset = useCallback(() => {
    const empty: Store = { "store-listing": [], details: [], screenshots: [] };
    storeRef.current = empty;
    listenersRef.current.forEach((cb) => cb());
  }, []);

  return (
    <SectionLocalesContext.Provider value={{ subscribe, getSnapshot, report, seed, reset }}>
      {children}
    </SectionLocalesContext.Provider>
  );
}

export function useSectionLocales(section: SectionName) {
  const ctx = useContext(SectionLocalesContext);
  if (!ctx) {
    throw new Error(
      "useSectionLocales must be used within SectionLocalesProvider",
    );
  }

  const store = useSyncExternalStore(ctx.subscribe, ctx.getSnapshot, ctx.getSnapshot);

  const reportLocales = useCallback(
    (locales: string[]) => ctx.report(section, locales),
    [ctx, section],
  );

  const otherSectionLocales: Partial<Record<SectionName, string[]>> = {};
  for (const key of Object.keys(store) as SectionName[]) {
    if (key !== section && store[key].length > 0) {
      otherSectionLocales[key] = store[key];
    }
  }

  return { reportLocales, otherSectionLocales };
}

/** Seed locales for sections that haven't self-reported yet. */
export function useSeedSectionLocales() {
  const ctx = useContext(SectionLocalesContext);
  if (!ctx) {
    throw new Error(
      "useSeedSectionLocales must be used within SectionLocalesProvider",
    );
  }
  return { seed: ctx.seed, reset: ctx.reset };
}
