"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { MessageKey } from "@/lib/i18n/messages";

export interface ConnectionError {
  category: "auth" | "connection" | "api" | "network";
  /** Server or ASC detail (English when from Apple). */
  message: string;
  /** Client-side fallback when no server message is available. */
  key?: MessageKey;
}

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
  error: ConnectionError | null;
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
export function normalizeApp(raw: { id: string; attributes?: Record<string, string | null> } & Record<string, unknown>): App {
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
  const [error, setError] = useState<ConnectionError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetch("/api/apps");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError({
          message: typeof data.error === "string" ? data.error : "",
          key: data.error ? undefined : "connectionErrors.loadAppsFailed",
          category: data.category ?? "api",
        });
        return;
      }

      const data = await res.json();
      const normalized = (data.apps ?? []).map(normalizeApp);
      setApps(normalized);
      setError(null);
    } catch {
      setError({ message: "", key: "connectionErrors.networkFailed", category: "network" });
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
