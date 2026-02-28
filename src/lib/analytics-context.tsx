"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AnalyticsData } from "@/lib/mock-analytics";

interface AnalyticsState {
  data: AnalyticsData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  meta: { fetchedAt: number; ttlMs: number } | null;
}

const AnalyticsContext = createContext<AnalyticsState | null>(null);

export function AnalyticsProvider({
  appId,
  children,
}: {
  appId: string;
  children: ReactNode;
}) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ fetchedAt: number; ttlMs: number } | null>(null);

  const fetchData = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);

    try {
      const qs = refresh ? "?refresh=true" : "";
      const res = await fetch(`/api/apps/${appId}/analytics${qs}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }

      setData(json.data);
      setMeta(json.meta ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch analytics");
    } finally {
      setLoading(false);
    }
  }, [appId]);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <AnalyticsContext.Provider
      value={{ data, loading, error, refresh, meta }}
    >
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics(): AnalyticsState {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) {
    throw new Error("useAnalytics must be used within an AnalyticsProvider");
  }
  return ctx;
}
