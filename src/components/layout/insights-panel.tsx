"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CircleNotch,
  ArrowsClockwise,
  X,
  ThumbsUp,
  ThumbsDown,
  TrendUp,
  Lightbulb,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAIStatus } from "@/lib/hooks/use-ai-status";
import { useInsightsPanel } from "@/lib/insights-panel-context";

// ── Review insights ─────────────────────────────────────────────────

interface ReviewInsights {
  strengths: string[];
  weaknesses: string[];
}

function ReviewInsightsContent({
  appId,
  onLoading,
}: {
  appId: string;
  onLoading: (loading: boolean) => void;
}) {
  const { configured: aiConfigured } = useAIStatus();
  const [insights, setInsights] = useState<ReviewInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasNewReviews, setHasNewReviews] = useState(false);
  const [cachedReviewCount, setCachedReviewCount] = useState<number | null>(null);
  const [currentReviewCount, setCurrentReviewCount] = useState<number | null>(null);
  const fetchedForApp = useRef<string | null>(null);

  const generate = useCallback(async (force = false) => {
    if (!aiConfigured) return;

    setLoading(true);
    onLoading(true);
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
      setCurrentReviewCount(data.currentReviewCount);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate insights");
    } finally {
      setLoading(false);
      onLoading(false);
    }
  }, [appId, aiConfigured, onLoading]);

  const fetchCachedAndAutoGenerate = useCallback(async () => {
    try {
      const res = await fetch(`/api/apps/${appId}/reviews/insights`);
      if (res.ok) {
        const data = await res.json();
        if (data.insights) {
          setInsights(data.insights);
          setCachedReviewCount(data.reviewCount);
          setCurrentReviewCount(data.currentReviewCount);
          if (data.currentReviewCount > data.reviewCount) {
            setHasNewReviews(true);
          }
          return;
        }
      }
    } catch {
      // Cache miss
    }

    if (aiConfigured) generate();
  }, [appId, generate, aiConfigured]);

  useEffect(() => {
    if (fetchedForApp.current !== appId) {
      fetchedForApp.current = appId;
      setInsights(null);
      setCachedReviewCount(null);
      setCurrentReviewCount(null);
      setHasNewReviews(false);
      fetchCachedAndAutoGenerate();
    }
  }, [appId, fetchCachedAndAutoGenerate]);

  const newReviewCount = cachedReviewCount != null && currentReviewCount != null
    ? currentReviewCount - cachedReviewCount
    : 0;

  if (!aiConfigured && !insights) {
    return <NotConfiguredState context="reviews" />;
  }

  if (loading) {
    return <LoadingState label="Analysing reviews…" />;
  }

  if (!insights) return null;

  return (
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
              <span>{s}</span>
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
              <span>{w}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Footer */}
      <div className="flex items-center justify-between border-t pt-3">
        <p className="text-[11px] text-muted-foreground">
          Based on {cachedReviewCount ?? "–"} review{(cachedReviewCount ?? 0) !== 1 ? "s" : ""}
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
  );
}

// ── Analytics insights ──────────────────────────────────────────────

interface AnalyticsInsights {
  highlights: string[];
  opportunities: string[];
}

function AnalyticsInsightsContent({
  appId,
  onLoading,
}: {
  appId: string;
  onLoading: (loading: boolean) => void;
}) {
  const { configured: aiConfigured } = useAIStatus();
  const [insights, setInsights] = useState<AnalyticsInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedForApp = useRef<string | null>(null);

  const generate = useCallback(async (force = false) => {
    if (!aiConfigured) return;

    setLoading(true);
    onLoading(true);
    try {
      const url = `/api/apps/${appId}/analytics/insights${force ? "?force=1" : ""}`;
      const res = await fetch(url, { method: "POST" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to generate insights");
      }

      const data = await res.json();
      setInsights(data.insights);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate insights");
    } finally {
      setLoading(false);
      onLoading(false);
    }
  }, [appId, aiConfigured, onLoading]);

  const fetchCachedAndAutoGenerate = useCallback(async () => {
    try {
      const res = await fetch(`/api/apps/${appId}/analytics/insights`);
      if (res.ok) {
        const data = await res.json();
        if (data.insights) {
          setInsights(data.insights);
          return;
        }
      }
    } catch {
      // Cache miss
    }

    if (aiConfigured) generate();
  }, [appId, generate, aiConfigured]);

  useEffect(() => {
    if (fetchedForApp.current !== appId) {
      fetchedForApp.current = appId;
      setInsights(null);
      fetchCachedAndAutoGenerate();
    }
  }, [appId, fetchCachedAndAutoGenerate]);

  if (!aiConfigured && !insights) {
    return <NotConfiguredState context="analytics" />;
  }

  if (loading) {
    return <LoadingState label="Analysing data…" />;
  }

  if (!insights) return null;

  return (
    <div className="space-y-5">
      {/* Highlights */}
      <section className="space-y-2">
        <Badge className="bg-blue-500/15 text-blue-600 hover:bg-blue-500/15 dark:text-blue-400 border-0 text-[10px] font-semibold uppercase tracking-wider">
          <TrendUp size={10} weight="bold" className="mr-1" />
          Highlights
        </Badge>
        <ul className="space-y-2">
          {insights.highlights.map((h, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm leading-snug">
              <span className="relative top-[-1px] size-1.5 shrink-0 rounded-full bg-blue-500" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Opportunities */}
      <section className="space-y-2">
        <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400 border-0 text-[10px] font-semibold uppercase tracking-wider">
          <Lightbulb size={10} weight="bold" className="mr-1" />
          Opportunities
        </Badge>
        <ul className="space-y-2">
          {insights.opportunities.map((o, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm leading-snug">
              <span className="relative top-[-1px] size-1.5 shrink-0 rounded-full bg-amber-500" />
              <span>{o}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Footer */}
      <div className="flex items-center justify-end border-t pt-3">
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
  );
}

// ── Shared components ───────────────────────────────────────────────

function NotConfiguredState({ context }: { context: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center px-2">
      <p className="text-sm text-muted-foreground">
        Insights uses AI to analyse your {context}. Configure an AI provider to get started.
      </p>
      <a
        href="/settings/ai"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Open settings
      </a>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2">
      <CircleNotch size={20} className="animate-spin text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────

type PanelMode = "reviews" | "analytics" | null;

function usePanelMode(): PanelMode {
  const pathname = usePathname();
  if (pathname.match(/\/reviews$/)) return "reviews";
  if (pathname.match(/\/analytics(\/|$)/)) return "analytics";
  return null;
}

export function InsightsPanel() {
  const { open, close } = useInsightsPanel();
  const { appId } = useParams<{ appId: string }>();
  const mode = usePanelMode();
  const [, setLoading] = useState(false);

  // Reset loading when mode changes
  const handleLoading = useCallback((l: boolean) => setLoading(l), []);

  if (!open || !mode || !appId) return null;

  return (
    <div className="fixed right-0 top-16 bottom-0 z-30 flex w-72 flex-col border-l bg-sidebar group-has-data-[collapsible=icon]/sidebar-wrapper:top-12">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-medium">Insights</h3>
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
        {mode === "reviews" && (
          <ReviewInsightsContent appId={appId} onLoading={handleLoading} />
        )}
        {mode === "analytics" && (
          <AnalyticsInsightsContent appId={appId} onLoading={handleLoading} />
        )}
      </div>
    </div>
  );
}
