"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { PaginatedList } from "@/components/paginated-list";
import { CircleNotch } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useApps } from "@/lib/apps-context";
import { useRegisterRefresh } from "@/lib/refresh-context";
import { useAIStatus } from "@/lib/hooks/use-ai-status";
import { AIRequiredDialog } from "@/components/ai-required-dialog";
import type { AscCustomerReview } from "@/lib/asc/reviews";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useMarkReviewsRead } from "@/lib/hooks/use-unread-reviews";
import { usePersistedState, usePersistedBool } from "@/lib/hooks/use-persisted-range";

import {
  type Review,
  normaliseAscReview,
  territoryToLocale,
  NON_ENGLISH_TERRITORIES,
} from "./_components/territory-helpers";
import { ReviewSummary } from "./_components/review-summary";
import { ReviewFilters } from "./_components/review-filters";
import { ReviewCard } from "./_components/review-card";
import { ReplyDialog } from "./_components/reply-dialog";
import { AppealDialog } from "./_components/appeal-dialog";
import { readReviewsPlatform, REVIEWS_PLATFORM_CHANGE } from "@/components/layout/header-version-picker";

// ── Main page ──────────────────────────────────────────────────────

export default function ReviewsPage() {
  const { appId } = useParams<{ appId: string }>();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { configured: aiConfigured } = useAIStatus();

  // Data fetching
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters (persisted)
  const [sortBy, setSortBy] = usePersistedState("reviews:sort", "newest");
  const [ratingFilter, setRatingFilter] = usePersistedState("reviews:rating", "all");
  const [territoryFilter, setTerritoryFilter] = usePersistedState("reviews:territory", "all");
  const [dateFilter, setDateFilter] = usePersistedState("reviews:date", "all");
  const [hideResponded, setHideResponded] = usePersistedBool("reviews:hide-responded", false);

  // Translation state
  const [translations, setTranslations] = useState<
    Record<string, { title: string; body: string }>
  >({});
  const [translating, setTranslating] = useState<Record<string, boolean>>({});
  const [showTranslation, setShowTranslation] = useState<
    Record<string, boolean>
  >({});

  // Reply dialog
  const [replyTarget, setReplyTarget] = useState<Review | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [editingResponseId, setEditingResponseId] = useState<string | null>(null);
  const [draftingReply, setDraftingReply] = useState(false);
  const [translatingReply, setTranslatingReply] = useState(false);

  // Delete response
  const [deletingResponseId, setDeletingResponseId] = useState<string | null>(null);

  // Appeal dialog
  const [appealTarget, setAppealTarget] = useState<Review | null>(null);
  const [appealText, setAppealText] = useState("");
  const [appealLoading, setAppealLoading] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 20;

  // AI required dialog
  const [showAIRequired, setShowAIRequired] = useState(false);

  const fetchReviews = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sort: sortBy });
      const platform = readReviewsPlatform(appId);
      if (platform) params.set("platform", platform);
      if (forceRefresh) params.set("refresh", "1");
      const url = `/api/apps/${appId}/reviews?${params}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to fetch reviews (${res.status})`);
      }
      const data = await res.json();
      const normalised: Review[] = data.reviews.map((r: AscCustomerReview) =>
        normaliseAscReview(r),
      );
      setReviews(normalised);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch reviews");
    } finally {
      setLoading(false);
    }
  }, [appId, sortBy]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Re-fetch when platform picker changes
  useEffect(() => {
    const handler = () => fetchReviews();
    window.addEventListener(REVIEWS_PLATFORM_CHANGE, handler);
    return () => window.removeEventListener(REVIEWS_PLATFORM_CHANGE, handler);
  }, [fetchReviews]);

  // Register with header refresh button – force refresh from ASC
  const handleRefresh = useCallback(() => fetchReviews(true), [fetchReviews]);
  useRegisterRefresh({ onRefresh: handleRefresh, busy: loading });

  // Mark reviews as read when page is visited
  useMarkReviewsRead(appId, reviews.length);

  // Client-side filtering (sort is server-side via API)
  const territories = useMemo(
    () => [...new Set(reviews.map((r) => r.territory))].sort(),
    [reviews],
  );

  const filtered = useMemo(() => {
    let result = [...reviews];

    if (dateFilter !== "all") {
      const now = new Date();
      let cutoff: Date;
      switch (dateFilter) {
        case "7d":
          cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
          break;
        case "30d":
          cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
          break;
        case "90d":
          cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
          break;
        case "year":
          cutoff = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          cutoff = new Date(0);
      }
      const cutoffStr = cutoff.toISOString();
      result = result.filter((r) => r.createdDate >= cutoffStr);
    }

    if (ratingFilter !== "all") {
      const star = parseInt(ratingFilter);
      result = result.filter((r) => r.rating === star);
    }

    if (territoryFilter !== "all") {
      result = result.filter((r) => r.territory === territoryFilter);
    }

    if (hideResponded) {
      result = result.filter((r) => !r.response);
    }

    return result;
  }, [reviews, dateFilter, ratingFilter, territoryFilter, hideResponded]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [ratingFilter, territoryFilter, dateFilter, hideResponded, sortBy]);

  // Summary stats (from all reviews, not filtered)
  const total = reviews.length;
  const avgRating =
    total > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));

  // ── Handlers ───────────────────────────────────────────────────

  async function handleTranslate(review: Review) {
    // Already translated – just toggle visibility
    if (translations[review.id]) {
      setShowTranslation((prev) => ({
        ...prev,
        [review.id]: !prev[review.id],
      }));
      return;
    }

    setTranslating((prev) => ({ ...prev, [review.id]: true }));

    try {
      const fromLocale = territoryToLocale(review.territory);
      const text = `${review.title}\n\n${review.body}`;

      const url = aiConfigured ? "/api/ai" : "/api/translate/google";
      const fetchBody = aiConfigured
        ? { action: "translate", text, field: "review", fromLocale, toLocale: "en-US" }
        : { text };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fetchBody),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Translation failed");
      }

      const { result } = await res.json();
      const parts = result.split("\n\n");
      const title = parts[0] ?? review.title;
      const body = parts.slice(1).join("\n\n") || parts[0] || review.body;

      setTranslations((prev) => ({
        ...prev,
        [review.id]: { title, body },
      }));
      setShowTranslation((prev) => ({ ...prev, [review.id]: true }));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Translation failed",
      );
    } finally {
      setTranslating((prev) => ({ ...prev, [review.id]: false }));
    }
  }

  async function handleReply() {
    if (!replyTarget || !replyBody.trim()) return;

    setReplying(true);
    try {
      const isEdit = !!editingResponseId;
      const res = await fetch(`/api/apps/${appId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? {
                action: "update",
                reviewId: replyTarget.id,
                responseId: editingResponseId,
                responseBody: replyBody.trim(),
              }
            : {
                action: "reply",
                reviewId: replyTarget.id,
                responseBody: replyBody.trim(),
              },
        ),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? (isEdit ? "Failed to update reply" : "Failed to send reply"));
      }

      const data = await res.json();

      // Update local state optimistically
      setReviews((prev) =>
        prev.map((r) =>
          r.id === replyTarget.id
            ? {
                ...r,
                response: {
                  id: data.responseId ?? "pending",
                  responseBody: replyBody.trim(),
                  lastModifiedDate: new Date().toISOString(),
                  state: "PENDING_PUBLISH" as const,
                },
              }
            : r,
        ),
      );

      toast.success(
        isEdit
          ? "Reply updated – it may take up to 24 hours to appear on the App Store"
          : "Reply sent – it may take up to 24 hours to appear on the App Store",
      );
      setReplyTarget(null);
      setReplyBody("");
      setEditingResponseId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setReplying(false);
    }
  }

  async function handleDraftReply() {
    if (!replyTarget) return;
    if (!aiConfigured) {
      setShowAIRequired(true);
      return;
    }

    setDraftingReply(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft-reply",
          text: replyTarget.body,
          reviewTitle: replyTarget.title,
          rating: replyTarget.rating,
          appName: app?.name,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "ai_not_configured") {
          setShowAIRequired(true);
          return;
        }
        throw new Error(data.error ?? "Failed to generate reply");
      }

      const { result } = await res.json();
      setReplyBody(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate reply");
    } finally {
      setDraftingReply(false);
    }
  }

  async function handleTranslateReply() {
    if (!replyTarget || !replyBody.trim()) return;
    if (!aiConfigured) {
      setShowAIRequired(true);
      return;
    }

    setTranslatingReply(true);
    try {
      const toLocale = territoryToLocale(replyTarget.territory);
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "translate",
          text: replyBody.trim(),
          field: "review-reply",
          fromLocale: "en-US",
          toLocale,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "ai_not_configured") {
          setShowAIRequired(true);
          return;
        }
        throw new Error(data.error ?? "Translation failed");
      }

      const { result } = await res.json();
      setReplyBody(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Translation failed");
    } finally {
      setTranslatingReply(false);
    }
  }

  async function handleAppeal(review: Review) {
    if (!aiConfigured) {
      setShowAIRequired(true);
      return;
    }

    setAppealTarget(review);
    setAppealText("");
    setAppealLoading(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft-appeal",
          text: review.body,
          reviewTitle: review.title,
          rating: review.rating,
          appName: app?.name,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "ai_not_configured") {
          setAppealTarget(null);
          setShowAIRequired(true);
          return;
        }
        throw new Error(data.error ?? "Failed to generate appeal");
      }

      const { result } = await res.json();
      setAppealText(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate appeal");
      setAppealTarget(null);
    } finally {
      setAppealLoading(false);
    }
  }

  async function handleCopyAndOpenASC() {
    try {
      await navigator.clipboard.writeText(appealText);
      window.open("https://appstoreconnect.apple.com", "_blank");
      toast.success("Appeal text copied to clipboard");
      setAppealTarget(null);
      setAppealText("");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }

  async function handleDeleteResponse(reviewId: string, responseId: string) {
    setDeletingResponseId(responseId);
    try {
      const res = await fetch(`/api/apps/${appId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", responseId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete response");
      }

      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId ? { ...r, response: undefined } : r,
        ),
      );
      toast.success("Response deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete response");
    } finally {
      setDeletingResponseId(null);
    }
  }

  function handleCloseReplyDialog() {
    setReplyTarget(null);
    setReplyBody("");
    setEditingResponseId(null);
  }

  function handleCloseAppealDialog() {
    setAppealTarget(null);
    setAppealText("");
  }

  function handleOpenReply(review: Review) {
    setReplyTarget(review);
    setReplyBody("");
  }

  function handleOpenEditReply(review: Review) {
    setReplyTarget(review);
    setReplyBody(review.response!.responseBody);
    setEditingResponseId(review.response!.id);
  }

  // ── Render ─────────────────────────────────────────────────────

  if (!app) {
    return <EmptyState title="App not found" />;
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <CircleNotch size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => fetchReviews()} />;
  }

  return (
    <div className="space-y-6">
      <ReviewSummary
        avgRating={avgRating}
        total={total}
        distribution={distribution}
      />

      <ReviewFilters
        sortBy={sortBy}
        onSortChange={setSortBy}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
        ratingFilter={ratingFilter}
        onRatingFilterChange={setRatingFilter}
        territoryFilter={territoryFilter}
        onTerritoryFilterChange={setTerritoryFilter}
        territories={territories}
        hideResponded={hideResponded}
        onHideRespondedChange={setHideResponded}
      />

      {/* Reviews list */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {total === 0
            ? "No reviews yet."
            : "No reviews match the current filters."}
        </div>
      ) : (
        <PaginatedList
          items={filtered}
          perPage={perPage}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        >
          {(pageReviews) => (
            <div className="space-y-4">
              {pageReviews.map((review) => {
                const foreign = NON_ENGLISH_TERRITORIES.has(review.territory);
                const translated =
                  showTranslation[review.id] && translations[review.id];

                return (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    foreign={foreign}
                    translated={translated || false}
                    isTranslating={!!translating[review.id]}
                    onTranslate={handleTranslate}
                    onReply={handleOpenReply}
                    onEdit={handleOpenEditReply}
                    onAppeal={handleAppeal}
                    onDeleteResponse={handleDeleteResponse}
                    deletingResponseId={deletingResponseId}
                  />
                );
              })}
            </div>
          )}
        </PaginatedList>
      )}

      <ReplyDialog
        replyTarget={replyTarget}
        replyBody={replyBody}
        onReplyBodyChange={setReplyBody}
        onClose={handleCloseReplyDialog}
        onSend={handleReply}
        replying={replying}
        editingResponseId={editingResponseId}
        onDraftReply={handleDraftReply}
        draftingReply={draftingReply}
        onTranslateReply={handleTranslateReply}
        translatingReply={translatingReply}
        translations={translations}
        showTranslation={showTranslation}
        onTranslate={handleTranslate}
        translating={translating}
      />

      <AppealDialog
        appealTarget={appealTarget}
        appealText={appealText}
        onAppealTextChange={setAppealText}
        appealLoading={appealLoading}
        onClose={handleCloseAppealDialog}
        onCopyAndOpen={handleCopyAndOpenASC}
      />

      <AIRequiredDialog
        open={showAIRequired}
        onOpenChange={setShowAIRequired}
      />
    </div>
  );
}
