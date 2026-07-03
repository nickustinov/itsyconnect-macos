"use client";

import { useState, useMemo, useEffect, useCallback, type Dispatch, type SetStateAction } from "react";
import { PaginatedList } from "@/components/paginated-list";
import { CircleNotch, AppWindow, Check } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApps } from "@/lib/apps-context";
import { useRegisterRefresh } from "@/lib/refresh-context";
import { useAIStatus } from "@/lib/hooks/use-ai-status";
import { useAiGuidance } from "@/lib/hooks/use-ai-guidance";
import { EmptyState } from "@/components/empty-state";
import { usePersistedState, usePersistedBool } from "@/lib/hooks/use-persisted-range";
import { useSeenReviews, registerKnownReviews } from "@/lib/hooks/use-seen-reviews";
import type { AscCustomerReview } from "@/lib/asc/reviews";

import {
  type Review,
  normaliseAscReview,
  NON_ENGLISH_TERRITORIES,
} from "../apps/[appId]/reviews/_components/territory-helpers";
import { ReviewFilters } from "../apps/[appId]/reviews/_components/review-filters";
import { ReviewCard } from "../apps/[appId]/reviews/_components/review-card";
import { useReviewActions } from "../apps/[appId]/reviews/_components/use-review-actions";
import { ReviewActionDialogs } from "../apps/[appId]/reviews/_components/review-action-dialogs";
import { getVersionPlatforms } from "@/lib/asc/version-types";
import { useTranslations } from "@/lib/i18n/locale-context";
import { useAscLabels } from "@/lib/i18n/use-asc-labels";

/** A review tagged with the app and platform it belongs to (all merged into one feed). */
type CenterReview = Review & {
  appId: string;
  appName: string;
  iconUrl: string | null;
  platform?: string;
};

/** Stable key per (app, platform) slice. */
const sliceKey = (r: CenterReview) => `${r.appId}:${r.platform ?? ""}`;

function sortReviews(list: CenterReview[], sortBy: string): CenterReview[] {
  const arr = [...list];
  switch (sortBy) {
    case "oldest":
      return arr.sort((a, b) => a.createdDate.localeCompare(b.createdDate));
    case "highest":
      return arr.sort((a, b) => b.rating - a.rating || b.createdDate.localeCompare(a.createdDate));
    case "lowest":
      return arr.sort((a, b) => a.rating - b.rating || b.createdDate.localeCompare(a.createdDate));
    case "newest":
    default:
      return arr.sort((a, b) => b.createdDate.localeCompare(a.createdDate));
  }
}

export default function ReviewCenterPage() {
  const t = useTranslations();
  const { platformLabel } = useAscLabels();
  const { apps, loading: appsLoading } = useApps();
  const { configured: aiConfigured } = useAIStatus();
  const { guidance: reviewGuidance, setGuidance: setReviewGuidance, saveGuidance: saveReviewGuidance } = useAiGuidance("reviews");
  const { seen, markSeen } = useSeenReviews();

  // Reviews keyed by app so re-fetching replaces a slice instead of appending
  // (idempotent – avoids duplicate keys when the effect runs twice in dev).
  const [byApp, setByApp] = useState<Record<string, CenterReview[]>>({});
  const [pending, setPending] = useState(0);

  // Flatten + dedupe by review id (demo mode ignores the platform param and
  // would otherwise return the same review under every platform).
  const reviews = useMemo(() => {
    const seen = new Set<string>();
    const out: CenterReview[] = [];
    for (const r of Object.values(byApp).flat()) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
    return out;
  }, [byApp]);

  // Adapter so useReviewActions can apply optimistic updates over the flat list.
  const setReviews = useCallback<Dispatch<SetStateAction<CenterReview[]>>>((action) => {
    setByApp((prev) => {
      const flat = Object.values(prev).flat();
      const next = typeof action === "function" ? action(flat) : action;
      const grouped: Record<string, CenterReview[]> = {};
      for (const r of next) (grouped[sliceKey(r)] ??= []).push(r);
      return grouped;
    });
  }, []);

  // Filters (persisted separately from the per-app page; default = needs reply)
  const [sortBy, setSortBy] = usePersistedState("review-center:sort", "newest");
  const [appFilter, setAppFilter] = usePersistedState("review-center:app", "all");
  const [platformFilter, setPlatformFilter] = usePersistedState("review-center:platform", "all");
  const [ratingFilter, setRatingFilter] = usePersistedState("review-center:rating", "all");
  const [territoryFilter, setTerritoryFilter] = usePersistedState("review-center:territory", "all");
  const [dateFilter, setDateFilter] = usePersistedState("review-center:date", "all");
  const [hideResponded, setHideResponded] = usePersistedBool("review-center:hide-responded", false);

  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 20;

  const actions = useReviewActions<CenterReview>({
    setReviews,
    resolveApp: (r) => {
      const cr = r as CenterReview;
      return { appId: cr.appId, appName: cr.appName };
    },
    aiConfigured,
    reviewGuidance,
  });

  const fetchAll = useCallback(
    async (forceRefresh = false) => {
      if (apps.length === 0) return;
      setPending(apps.length);
      await Promise.allSettled(
        apps.map(async (app) => {
          try {
            // Platform isn't a review attribute – it's derived by fetching each
            // platform's reviews via its appStoreVersions. Get the app's platforms first.
            let platforms: string[] = [];
            try {
              const vres = await fetch(`/api/apps/${app.id}/versions`);
              if (vres.ok) platforms = getVersionPlatforms((await vres.json()).versions ?? []);
            } catch { /* fall back below */ }

            const fetchSlice = async (platform: string | null) => {
              const params = new URLSearchParams({ sort: "newest" });
              if (platform) params.set("platform", platform);
              if (forceRefresh) params.set("refresh", "1");
              const res = await fetch(`/api/apps/${app.id}/reviews?${params}`);
              if (!res.ok) return;
              const data = await res.json();
              const mapped: CenterReview[] = (data.reviews ?? []).map(
                (r: AscCustomerReview) => ({
                  ...normaliseAscReview(r),
                  appId: app.id,
                  appName: app.name,
                  iconUrl: app.iconUrl,
                  platform: platform ?? undefined,
                }),
              );
              setByApp((prev) => ({ ...prev, [`${app.id}:${platform ?? ""}`]: mapped }));
            };

            // No versions → fall back to the app-level (all-platform) feed, untagged.
            await Promise.allSettled(
              platforms.length > 0
                ? platforms.map((p) => fetchSlice(p))
                : [fetchSlice(null)],
            );
          } finally {
            setPending((p) => p - 1);
          }
        }),
      );
    },
    [apps],
  );

  useEffect(() => {
    if (appsLoading || apps.length === 0) return;
    fetchAll();
  }, [appsLoading, apps.length, fetchAll]);

  const handleRefresh = useCallback(() => fetchAll(true), [fetchAll]);
  useRegisterRefresh({ onRefresh: handleRefresh, busy: pending > 0 });

  // Keep the unseen badge accurate: register the full id set per app.
  useEffect(() => {
    const idsByApp: Record<string, string[]> = {};
    for (const r of reviews) (idsByApp[r.appId] ??= []).push(r.id);
    for (const [appId, ids] of Object.entries(idsByApp)) registerKnownReviews(appId, ids);
  }, [reviews]);

  const territories = useMemo(
    () => [...new Set(reviews.map((r) => r.territory))].sort(),
    [reviews],
  );

  const availablePlatforms = useMemo(
    () => [...new Set(reviews.map((r) => r.platform).filter((p): p is string => !!p))].sort(),
    [reviews],
  );

  const filtered = useMemo(() => {
    // The review center is an inbox of unseen reviews.
    let result = reviews.filter((r) => !seen.has(r.id));

    if (appFilter !== "all") {
      result = result.filter((r) => r.appId === appFilter);
    }

    if (platformFilter !== "all") {
      result = result.filter((r) => r.platform === platformFilter);
    }

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

    return sortReviews(result, sortBy);
  }, [reviews, seen, appFilter, platformFilter, dateFilter, ratingFilter, territoryFilter, hideResponded, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [appFilter, platformFilter, ratingFilter, territoryFilter, dateFilter, hideResponded, sortBy]);

  // ── Render ─────────────────────────────────────────────────────

  if (appsLoading || (pending > 0 && reviews.length === 0)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <CircleNotch size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (apps.length === 0) {
    return <EmptyState icon={AppWindow} title={t("reviewCenter.noApps")} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={appFilter} onValueChange={setAppFilter}>
          <SelectTrigger className="w-[180px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("reviewCenter.allApps")}</SelectItem>
            {apps.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {availablePlatforms.length > 1 && (
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[140px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("reviewCenter.allPlatforms")}</SelectItem>
              {availablePlatforms.map((p) => (
                <SelectItem key={p} value={p}>
                  {platformLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

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

        {filtered.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => markSeen(reviews.map((r) => r.id))}
          >
            <Check size={14} className="mr-1.5" />
            {t("reviewCenter.markAllSeen")}
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("reviewCenter.emptyCaughtUp")}
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
                    app={{ name: review.appName, iconUrl: review.iconUrl }}
                    platform={review.platform ? platformLabel(review.platform) : undefined}
                    foreign={foreign}
                    translated={translated || false}
                    isTranslating={!!actions.translating[review.id]}
                    onTranslate={actions.onTranslate}
                    onReply={actions.onReply}
                    onEdit={actions.onEdit}
                    onAppeal={actions.onAppeal}
                    onDeleteResponse={actions.onDeleteResponse}
                    deletingResponseId={actions.deletingResponseId}
                    seen={false}
                    onToggleSeen={(r) => markSeen([r.id])}
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
