"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { PaginatedList } from "@/components/paginated-list";
import { CircleNotch } from "@phosphor-icons/react";
import { useApps } from "@/lib/apps-context";
import { useRegisterRefresh } from "@/lib/refresh-context";
import { useAIStatus } from "@/lib/hooks/use-ai-status";
import { useAiGuidance } from "@/lib/hooks/use-ai-guidance";
import type { AscCustomerReview } from "@/lib/asc/reviews";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useMarkReviewsRead } from "@/lib/hooks/use-unread-reviews";
import { useSeenReviews } from "@/lib/hooks/use-seen-reviews";
import { usePersistedState, usePersistedBool } from "@/lib/hooks/use-persisted-range";

import {
  type Review,
  normaliseAscReview,
  NON_ENGLISH_TERRITORIES,
} from "./_components/territory-helpers";
import { ReviewSummary } from "./_components/review-summary";
import { ReviewFilters } from "./_components/review-filters";
import { ReviewCard } from "./_components/review-card";
import { useReviewActions } from "./_components/use-review-actions";
import { ReviewActionDialogs } from "./_components/review-action-dialogs";
import { readReviewsPlatform, REVIEWS_PLATFORM_CHANGE } from "@/components/layout/header-version-picker";
import { useVersions } from "@/lib/versions-context";
import { getVersionPlatforms } from "@/lib/asc/version-types";
import { useTranslations } from "@/lib/i18n/locale-context";

// ── Main page ──────────────────────────────────────────────────────

export default function ReviewsPage() {
  const t = useTranslations();
  const { appId } = useParams<{ appId: string }>();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { configured: aiConfigured } = useAIStatus();
  const { guidance: reviewGuidance, setGuidance: setReviewGuidance, saveGuidance: saveReviewGuidance } = useAiGuidance("reviews");
  const { versions, loading: versionsLoading } = useVersions();
  const platforms = useMemo(() => getVersionPlatforms(versions), [versions]);
  const { seen, markSeen, markUnseen } = useSeenReviews();

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

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 20;

  // Per-review actions (translate, reply, appeal, delete) – shared with review center
  const actions = useReviewActions<Review>({
    setReviews,
    resolveApp: () => ({ appId, appName: app?.name }),
    aiConfigured,
    reviewGuidance,
  });

  const fetchReviews = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sort: sortBy });
      const stored = readReviewsPlatform(appId);
      const platform = stored && platforms.includes(stored) ? stored : platforms[0];
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
      setError(err instanceof Error ? err.message : t("reviews.fetchFailed"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, sortBy, platforms.join()]);

  // Clear stale reviews when the app changes so we don't show the previous app's data.
  useEffect(() => {
    setReviews([]);
    setLoading(true);
  }, [appId]);

  useEffect(() => {
    if (versionsLoading || platforms.length === 0) return;
    fetchReviews();
  }, [fetchReviews, versionsLoading, platforms.length]);

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

  // ── Render ─────────────────────────────────────────────────────

  if (!app) {
    return <EmptyState title={t("app.notFound")} />;
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
            ? t("reviews.emptyNone")
            : t("reviews.emptyNoMatch")}
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
                  actions.showTranslation[review.id] && actions.translations[review.id];

                return (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    foreign={foreign}
                    translated={translated || false}
                    isTranslating={!!actions.translating[review.id]}
                    onTranslate={actions.onTranslate}
                    onReply={actions.onReply}
                    onEdit={actions.onEdit}
                    onAppeal={actions.onAppeal}
                    onDeleteResponse={actions.onDeleteResponse}
                    deletingResponseId={actions.deletingResponseId}
                    seen={seen.has(review.id)}
                    onToggleSeen={(r) =>
                      seen.has(r.id) ? markUnseen([r.id]) : markSeen([r.id])
                    }
                  />
                );
              })}
            </div>
          )}
        </PaginatedList>
      )}

      <ReviewActionDialogs
        actions={actions}
        guidance={reviewGuidance}
        onGuidanceChange={setReviewGuidance}
        onGuidanceBlur={saveReviewGuidance}
      />
    </div>
  );
}
