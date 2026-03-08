"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";

type PanelMode = "reviews" | "analytics";

const STORAGE_KEYS: Record<PanelMode, string> = {
  reviews: "insights-panel:reviews",
  analytics: "insights-panel:analytics",
};

function detectMode(pathname: string): PanelMode | null {
  if (pathname.match(/\/reviews$/)) return "reviews";
  if (pathname.match(/\/analytics(\/|$)/)) return "analytics";
  return null;
}

function readPersisted(mode: PanelMode): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS[mode]) === "1";
  } catch {
    return false;
  }
}

function writePersisted(mode: PanelMode, value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS[mode], value ? "1" : "0");
  } catch {}
}

interface InsightsPanelContextValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

const InsightsPanelContext = createContext<InsightsPanelContextValue>({
  open: false,
  toggle: () => {},
  close: () => {},
});

export function InsightsPanelProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mode = detectMode(pathname);

  const [state, setState] = useState<Record<PanelMode, boolean>>({
    reviews: false,
    analytics: false,
  });

  // Hydrate from localStorage after mount
  useEffect(() => {
    setState({
      reviews: readPersisted("reviews"),
      analytics: readPersisted("analytics"),
    });
  }, []);

  const open = mode ? state[mode] : false;

  const toggle = useCallback(() => {
    if (!mode) return;
    setState((prev) => {
      const next = !prev[mode];
      writePersisted(mode, next);
      return { ...prev, [mode]: next };
    });
  }, [mode]);

  const close = useCallback(() => {
    if (!mode) return;
    setState((prev) => {
      writePersisted(mode, false);
      return { ...prev, [mode]: false };
    });
  }, [mode]);

  return (
    <InsightsPanelContext.Provider value={{ open, toggle, close }}>
      {children}
    </InsightsPanelContext.Provider>
  );
}

export function useInsightsPanel() {
  return useContext(InsightsPanelContext);
}
