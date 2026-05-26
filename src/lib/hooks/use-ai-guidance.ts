"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type GuidanceScope = "translation" | "reviews";

/**
 * Scoped AI guidance – standing instructions for one bucket (e.g. translation
 * tone vs review-reply voice). Persisted per scope so it's remembered across
 * dialogs and sessions, but edited inline from the relevant AI dialog.
 */
export function useAiGuidance(scope: GuidanceScope) {
  const [guidance, setGuidanceState] = useState("");
  const valueRef = useRef("");
  const savedRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/app-preferences/ai-guidance?scope=${scope}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const value = String(d.guidance ?? "");
        valueRef.current = value;
        savedRef.current = value;
        setGuidanceState(value);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [scope]);

  const setGuidance = useCallback((value: string) => {
    valueRef.current = value;
    setGuidanceState(value);
  }, []);

  /** Persist the current value (no-op if unchanged). Call on blur. */
  const saveGuidance = useCallback(async () => {
    const trimmed = valueRef.current.trim();
    if (trimmed === savedRef.current) return;
    savedRef.current = trimmed;
    try {
      await fetch("/api/app-preferences/ai-guidance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, guidance: trimmed }),
      });
    } catch {
      // Best-effort; the value is still sent per-run with the request.
    }
  }, [scope]);

  return { guidance, setGuidance, saveGuidance };
}
