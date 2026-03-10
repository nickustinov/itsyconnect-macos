"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { AscScreenshotSet } from "@/lib/asc/screenshots";

const POLL_INTERVAL = 3000;

const TERMINAL_STATES = new Set(["COMPLETE", "FAILED"]);

function hasProcessingScreenshots(sets: AscScreenshotSet[]): boolean {
  return sets.some((s) =>
    s.screenshots.some(
      (ss) => !TERMINAL_STATES.has(ss.attributes.assetDeliveryState?.state ?? ""),
    ),
  );
}

interface UseScreenshotSetsResult {
  screenshotSets: AscScreenshotSet[];
  setScreenshotSets: React.Dispatch<React.SetStateAction<AscScreenshotSet[]>>;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useScreenshotSets(
  appId: string,
  versionId: string,
  localizationId: string,
): UseScreenshotSetsResult {
  const [screenshotSets, setScreenshotSets] = useState<AscScreenshotSet[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);

  const fetchSets = useCallback(async (forceRefresh = false) => {
    if (!appId || !versionId || !localizationId) {
      setScreenshotSets([]);
      setLoading(false);
      return;
    }

    // Only show full-page loading spinner on initial load
    if (!initialLoadDone.current) {
      setLoading(true);
    }

    const qs = forceRefresh ? "?refresh=1" : "";
    try {
      const res = await fetch(
        `/api/apps/${appId}/versions/${versionId}/localizations/${localizationId}/screenshots${qs}`,
      );
      if (!res.ok) {
        setScreenshotSets([]);
        return;
      }

      const data = await res.json();
      setScreenshotSets(data.screenshotSets ?? []);
      initialLoadDone.current = true;
    } catch {
      setScreenshotSets([]);
    } finally {
      setLoading(false);
    }
  }, [appId, versionId, localizationId]);

  const refresh = useCallback(() => fetchSets(true), [fetchSets]);

  // Reset initial load flag when parameters change
  useEffect(() => {
    initialLoadDone.current = false;
  }, [appId, versionId, localizationId]);

  useEffect(() => {
    fetchSets();
  }, [fetchSets]);

  // Auto-poll while any screenshot is still processing
  useEffect(() => {
    if (!hasProcessingScreenshots(screenshotSets)) return;

    const timer = setInterval(() => {
      fetchSets(true);
    }, POLL_INTERVAL);

    return () => clearInterval(timer);
  }, [screenshotSets, fetchSets]);

  return { screenshotSets, setScreenshotSets, loading, refresh };
}
