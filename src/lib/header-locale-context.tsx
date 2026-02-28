"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SectionName } from "./section-locales-context";

export interface HeaderLocaleConfig {
  locales: string[];
  selectedLocale: string;
  primaryLocale: string;
  section: SectionName;
  otherSectionLocales?: Partial<Record<SectionName, string[]>>;
  availableLocales?: string[];
  readOnly?: boolean;
  onLocaleChange: (code: string) => void;
  onLocaleAdd: (code: string) => void;
  onLocalesAdd?: (codes: string[]) => void;
  onLocaleDelete?: (code: string) => void;
  onBulkTranslate?: () => void;
  onBulkCopy?: () => void;
  onBulkTranslateAll?: () => void;
  onBulkCopyAll?: () => void;
}

interface HeaderLocaleContextValue {
  configRef: React.RefObject<HeaderLocaleConfig | null>;
  version: number;
  setVersion: React.Dispatch<React.SetStateAction<number>>;
}

const HeaderLocaleContext = createContext<HeaderLocaleContextValue>({
  configRef: { current: null },
  version: 0,
  setVersion: () => {},
});

export function HeaderLocaleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const configRef = useRef<HeaderLocaleConfig | null>(null);
  const [version, setVersion] = useState(0);

  return (
    <HeaderLocaleContext.Provider value={{ configRef, version, setVersion }}>
      {children}
    </HeaderLocaleContext.Provider>
  );
}

/**
 * Pages call this to register their locale picker state with the header.
 * Handlers are kept fresh via a ref; display data changes trigger header re-render.
 */
export function useRegisterHeaderLocale(config: HeaderLocaleConfig) {
  const { configRef, setVersion } = useContext(HeaderLocaleContext);

  // Keep a local ref so handlers are always fresh
  const latestRef = useRef(config);
  latestRef.current = config;

  useEffect(() => {
    const prev = configRef.current;
    configRef.current = latestRef.current;

    // Only bump version (trigger header re-render) when display data changes
    if (
      !prev ||
      prev.selectedLocale !== config.selectedLocale ||
      prev.locales !== config.locales ||
      prev.primaryLocale !== config.primaryLocale ||
      prev.readOnly !== config.readOnly ||
      prev.section !== config.section ||
      prev.availableLocales !== config.availableLocales
    ) {
      setVersion((v) => v + 1);
    }
  });

  // Unregister on unmount – only if still owned by this section
  const section = config.section;
  useEffect(() => {
    return () => {
      if (configRef.current?.section === section) {
        configRef.current = null;
        setVersion((v) => v + 1);
      }
    };
  }, [configRef, setVersion, section]);
}

/** Header reads the current locale picker config. */
export function useHeaderLocale() {
  const { configRef, version } = useContext(HeaderLocaleContext);
  void version; // subscribe to version changes
  return configRef;
}
