"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "insights-panel-open";

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

function readPersistedState(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function InsightsPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // Hydrate from localStorage after mount
  useEffect(() => {
    setOpen(readPersistedState());
  }, []);

  const toggle = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, "0"); } catch {}
  }, []);

  return (
    <InsightsPanelContext.Provider value={{ open, toggle, close }}>
      {children}
    </InsightsPanelContext.Provider>
  );
}

export function useInsightsPanel() {
  return useContext(InsightsPanelContext);
}
