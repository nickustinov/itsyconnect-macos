"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CircleNotch,
  ArrowsClockwise,
  X,
  ThumbsUp,
  ThumbsDown,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAIStatus } from "@/lib/hooks/use-ai-status";
import { useInsightsPanel } from "@/lib/insights-panel-context";

interface InsightPoint {
  point: string;
  mentions: number;
}

interface Insights {
  strengths: InsightPoint[];
  weaknesses: InsightPoint[];
}

export function InsightsPanel({
  appId,
  reviewCount,
  dateRange,
}: {
  appId: string;
  reviewCount: number;
  dateRange: { from: string; to: string } | null;
}) {
  const { open, close } = useInsightsPanel();
  const { configured: aiConfigured } = useAIStatus();
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasNewReviews, setHasNewReviews] = useState(false);
  const [cachedReviewCount, setCachedReviewCount] = useState<number | null>(null);
  const fetchedForApp = useRef<string | null>(null);

  const generate = useCallback(async (force = false) => {
    if (!aiConfigured) return;

    setLoading(true);
    setHasNewReviews(false);
    try {
      const url = `/api/apps/${appId}/reviews/insights${force ? "?force=1" : ""}`;
      const res = await fetch(url, { method: "POST" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to generate insights");
      }

      const data = await res.json();
      setInsights(data.insights);
      setCachedReviewCount(data.reviewCount);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate insights");
    } finally {
      setLoading(false);
    }
  }, [appId, aiConfigured]);

  // Fetch cached insights on open, auto-generate if none
  const fetchCachedAndAutoGenerate = useCallback(async () => {
    try {
      const res = await fetch(`/api/apps/${appId}/reviews/insights`);
      if (res.ok) {
        const data = await res.json();
        if (data.insights) {
          setInsights(data.insights);
          setCachedReviewCount(data.reviewCount);
          // Check if there are new reviews since last generation
          if (data.currentReviewCount > data.reviewCount) {
            setHasNewReviews(true);
          }
          return;
        }
      }
    } catch {
      // Cache miss
    }

    // No cached insights – auto-generate if AI is configured
    if (aiConfigured) generate();
  }, [appId, generate, aiConfigured]);

  useEffect(() => {
    if (open && fetchedForApp.current !== appId) {
      fetchedForApp.current = appId;
      setInsights(null);
      setCachedReviewCount(null);
      setHasNewReviews(false);
      fetchCachedAndAutoGenerate();
    }
  }, [open, appId, fetchCachedAndAutoGenerate]);

  if (!open) return null;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const newReviewCount = cachedReviewCount != null ? reviewCount - cachedReviewCount : 0;

  return (
    <>
      {/* Fixed panel on right side, below header, above footers */}
      <div className="fixed right-0 top-16 bottom-0 z-30 flex w-72 flex-col border-l bg-sidebar group-has-data-[collapsible=icon]/sidebar-wrapper:top-12">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Insights</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            onClick={close}
          >
            <X size={14} />
          </Button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
          {!aiConfigured && !insights && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center px-2">
              <p className="text-sm text-muted-foreground">
                Insights uses AI to analyse your reviews. Configure an AI provider to get started.
              </p>
              <a
                href="/settings/ai"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Open settings
              </a>
            </div>
          )}

          {loading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2">
              <CircleNotch size={20} className="animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Analysing reviews…</p>
            </div>
          )}

          {insights && !loading && (
            <div className="space-y-5">
              {/* New reviews banner */}
              {hasNewReviews && newReviewCount > 0 && (
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
                  onClick={() => generate()}
                >
                  <span>{newReviewCount} new review{newReviewCount !== 1 ? "s" : ""} – tap to update</span>
                  <ArrowsClockwise size={12} />
                </button>
              )}

              {/* Date range */}
              {dateRange && (
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {formatDate(dateRange.from)} – {formatDate(dateRange.to)}
                </p>
              )}

              {/* Strengths */}
              <section className="space-y-2">
                <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400 border-0 text-[10px] font-semibold uppercase tracking-wider">
                  <ThumbsUp size={10} weight="bold" className="mr-1" />
                  Strengths
                </Badge>
                <ul className="space-y-2">
                  {insights.strengths.map((s, i) => (
                    <li key={i} className="flex items-baseline gap-2 text-sm leading-snug">
                      <span className="relative top-[-1px] size-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span className="flex-1">{s.point}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {s.mentions}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Weaknesses */}
              <section className="space-y-2">
                <Badge className="bg-red-500/15 text-red-600 hover:bg-red-500/15 dark:text-red-400 border-0 text-[10px] font-semibold uppercase tracking-wider">
                  <ThumbsDown size={10} weight="bold" className="mr-1" />
                  Weaknesses
                </Badge>
                <ul className="space-y-2">
                  {insights.weaknesses.map((w, i) => (
                    <li key={i} className="flex items-baseline gap-2 text-sm leading-snug">
                      <span className="relative top-[-1px] size-1.5 shrink-0 rounded-full bg-red-500" />
                      <span className="flex-1">{w.point}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {w.mentions}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Footer */}
              <div className="flex items-center justify-between border-t pt-3">
                <p className="text-[11px] text-muted-foreground">
                  Based on {cachedReviewCount ?? reviewCount} review{(cachedReviewCount ?? reviewCount) !== 1 ? "s" : ""}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground"
                  onClick={() => generate(true)}
                  disabled={loading}
                  title="Regenerate insights"
                >
                  <ArrowsClockwise size={12} />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

    </>
  );
}
