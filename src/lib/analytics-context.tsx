"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AnalyticsData } from "@/lib/asc/analytics";
import { useRegisterRefresh } from "@/lib/refresh-context";

interface AnalyticsState {
  data: AnalyticsData | null;
  loading: boolean;
  error: string | null;
  pending: boolean; // bg worker hasn't fetched this app yet
  meta: { fetchedAt: number; ttlMs: number } | null;
  /** Last date with available data (e.g. "2026-02-27"). Presets anchor to this. */
  lastDate: string | undefined;
}

const AnalyticsContext = createContext<AnalyticsState | null>(null);

const POLL_INTERVAL = 3000;
const MAX_POLLS = 20; // 20 × 3s = 60s max wait

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
  const [pending, setPending] = useState(false);
  const [meta, setMeta] = useState<{ fetchedAt: number; ttlMs: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCount = useRef(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/apps/${appId}/analytics`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setPending(false);
        setRefreshing(false);
        return;
      }

      if (json.pending) {
        pollCount.current += 1;
        if (pollCount.current >= MAX_POLLS) {
          setPending(false);
          setRefreshing(false);
          setError("Analytics refresh timed out – try again later");
          return;
        }
        setPending(true);
        return;
      }

      pollCount.current = 0;
      setPending(false);
      setRefreshing(false);
      setData(json.data);
      setMeta(json.meta ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch analytics");
      setPending(false);
      setRefreshing(false);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll while pending (bg worker hasn't reached this app yet)
  useEffect(() => {
    if (!pending) return;

    pollTimer.current = setInterval(() => {
      fetchData();
    }, POLL_INTERVAL);

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [pending, fetchData]);

  // Manual refresh: invalidate cache + trigger background rebuild
  const triggerRefresh = useCallback(async () => {
    setRefreshing(true);
    pollCount.current = 0;
    try {
      await fetch(`/api/apps/${appId}/analytics/refresh`, { method: "POST" });
      setPending(true);
      await fetchData();
    } catch {
      setRefreshing(false);
    }
  }, [appId, fetchData]);

  // Register with header refresh button
  useRegisterRefresh({
    onRefresh: triggerRefresh,
    busy: refreshing || pending,
  });

  // Derive last available data date as the max last date across key series,
  // so presets anchor to the most recent data available.
  const lastDate = useMemo(() => {
    if (!data) return undefined;
    const lastDates: string[] = [];
    for (const series of [data.dailyDownloads, data.dailyRevenue, data.dailySessions, data.dailyEngagement, data.dailyCrashes]) {
      if (series && series.length > 0) lastDates.push(series[series.length - 1].date);
    }
    if (lastDates.length === 0) return undefined;
    return lastDates.reduce((max, d) => (d > max ? d : max));
  }, [data]);

  return (
    <AnalyticsContext.Provider
      value={{ data, loading, error, pending, meta, lastDate }}
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
