"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export interface App {
  id: string;
  name: string;
  bundleId: string;
  sku: string;
  primaryLocale: string;
  contentRightsDeclaration: string | null;
  subscriptionStatusUrl: string | null;
  subscriptionStatusUrlForSandbox: string | null;
  iconUrl: string | null;
}

interface AppsContextValue {
  apps: App[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Update a single app in-place without refetching. */
  updateApp: (appId: string, updater: (a: App) => App) => void;
}

const AppsContext = createContext<AppsContextValue>({
  apps: [],
  loading: true,
  error: null,
  refresh: async () => {},
  updateApp: () => {},
});

/** Normalize ASC API shape to flat App interface. */
function normalizeApp(raw: { id: string; attributes?: Record<string, string | null> } & Record<string, unknown>): App {
  if (raw.attributes) {
    return {
      id: raw.id,
      name: raw.attributes.name ?? "",
      bundleId: raw.attributes.bundleId ?? "",
      sku: raw.attributes.sku ?? "",
      primaryLocale: raw.attributes.primaryLocale ?? "",
      contentRightsDeclaration: raw.attributes.contentRightsDeclaration ?? null,
      subscriptionStatusUrl: raw.attributes.subscriptionStatusUrl ?? null,
      subscriptionStatusUrlForSandbox: raw.attributes.subscriptionStatusUrlForSandbox ?? null,
      iconUrl: raw.attributes.iconUrl ?? null,
    };
  }
  return raw as unknown as App;
}

export function AppsProvider({ children }: { children: React.ReactNode }) {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/apps");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to load apps");
        setApps([]);
        return;
      }

      const data = await res.json();
      const normalized = (data.apps ?? []).map(normalizeApp);
      setApps(normalized);
    } catch {
      setError("Network error");
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateApp = useCallback(
    (appId: string, updater: (a: App) => App) => {
      setApps((prev) => prev.map((a) => (a.id === appId ? updater(a) : a)));
    },
    [],
  );

  return (
    <AppsContext.Provider value={{ apps, loading, error, refresh, updateApp }}>
      {children}
    </AppsContext.Provider>
  );
}

export function useApps() {
  return useContext(AppsContext);
}
