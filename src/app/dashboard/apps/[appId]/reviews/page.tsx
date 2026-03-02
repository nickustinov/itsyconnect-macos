"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PaginatedList } from "@/components/paginated-list";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Star,
  ChatText,
  WarningCircle,
  Translate,
  CircleNotch,
  MagicWand,
  PencilSimple,
  Copy,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useApps } from "@/lib/apps-context";
import { useRegisterRefresh } from "@/lib/refresh-context";
import { useAIStatus } from "@/lib/hooks/use-ai-status";
import { AIRequiredDialog } from "@/components/ai-required-dialog";
import type { AscCustomerReview } from "@/lib/asc/reviews";
import { EmptyState } from "@/components/empty-state";

// ── Territory helpers ──────────────────────────────────────────────

/** Map ISO 3166-1 alpha-3 → alpha-2 for common territories (Intl.DisplayNames uses alpha-2). */
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  USA: "US", GBR: "GB", FRA: "FR", DEU: "DE", JPN: "JP", ESP: "ES",
  ITA: "IT", BRA: "BR", CHN: "CN", KOR: "KR", RUS: "RU", CAN: "CA",
  AUS: "AU", NLD: "NL", MEX: "MX", IND: "IN", SGP: "SG", SWE: "SE",
  NOR: "NO", DNK: "DK", FIN: "FI", CHE: "CH", AUT: "AT", BEL: "BE",
  PRT: "PT", POL: "PL", TUR: "TR", ARE: "AE", SAU: "SA", THA: "TH",
  IDN: "ID", MYS: "MY", PHL: "PH", VNM: "VN", TWN: "TW", HKG: "HK",
  NZL: "NZ", ZAF: "ZA", ARG: "AR", CHL: "CL", COL: "CO", PER: "PE",
  ISR: "IL", EGY: "EG", NGA: "NG", KEN: "KE", UKR: "UA", ROU: "RO",
  CZE: "CZ", HUN: "HU", GRC: "GR", IRL: "IE", LUX: "LU", HRV: "HR",
};

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function territoryName(alpha3: string): string {
  const alpha2 = ALPHA3_TO_ALPHA2[alpha3];
  if (alpha2) {
    try {
      return regionNames.of(alpha2) ?? alpha3;
    } catch {
      return alpha3;
    }
  }
  return alpha3;
}

/** Territories where English is not the primary language. */
const NON_ENGLISH_TERRITORIES = new Set([
  "FRA", "DEU", "JPN", "ESP", "ITA", "BRA", "CHN", "KOR", "RUS",
  "MEX", "NLD", "SWE", "NOR", "DNK", "FIN", "AUT", "PRT", "POL",
  "TUR", "ARE", "SAU", "THA", "IDN", "MYS", "VNM", "TWN", "HKG",
  "ARG", "CHL", "COL", "PER", "EGY", "UKR", "ROU", "CZE", "HUN",
  "GRC", "HRV", "CHE", "BEL", "LUX",
]);

/** Map territory alpha-3 to a rough locale for translation source language. */
function territoryToLocale(alpha3: string): string {
  const map: Record<string, string> = {
    FRA: "fr-FR", DEU: "de-DE", JPN: "ja-JP", ESP: "es-ES", ITA: "it-IT",
    BRA: "pt-BR", CHN: "zh-CN", KOR: "ko-KR", RUS: "ru-RU", MEX: "es-MX",
    NLD: "nl-NL", SWE: "sv-SE", NOR: "nb-NO", DNK: "da-DK", FIN: "fi-FI",
    AUT: "de-AT", PRT: "pt-PT", POL: "pl-PL", TUR: "tr-TR", ARE: "ar-AE",
    SAU: "ar-SA", THA: "th-TH", IDN: "id-ID", VNM: "vi-VN", TWN: "zh-TW",
    HKG: "zh-HK", ARG: "es-AR", CHL: "es-CL", COL: "es-CO", PER: "es-PE",
    EGY: "ar-EG", UKR: "uk-UA", ROU: "ro-RO", CZE: "cs-CZ", HUN: "hu-HU",
    GRC: "el-GR", HRV: "hr-HR", CHE: "de-CH", BEL: "fr-BE", LUX: "fr-LU",
    MYS: "ms-MY",
  };
  return map[alpha3] ?? "en-US";
}

// ── Normalised review type ─────────────────────────────────────────

interface Review {
  id: string;
  rating: number;
  title: string;
  body: string;
  reviewerNickname: string;
  territory: string;
  createdDate: string;
  response?: {
    id: string;
    responseBody: string;
    lastModifiedDate: string;
    state: "PENDING_PUBLISH" | "PUBLISHED";
  };
}

function normaliseAscReview(r: AscCustomerReview): Review {
  return {
    id: r.id,
    rating: r.attributes.rating,
    title: r.attributes.title,
    body: r.attributes.body,
    reviewerNickname: r.attributes.reviewerNickname,
    territory: r.attributes.territory,
    createdDate: r.attributes.createdDate,
    response: r.response
      ? {
          id: r.response.id,
          responseBody: r.response.attributes.responseBody,
          lastModifiedDate: r.response.attributes.lastModifiedDate,
          state: r.response.attributes.state,
        }
      : undefined,
  };
}

// ── Sub-components ─────────────────────────────────────────────────

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={size}
          weight={i < rating ? "fill" : "regular"}
          className={
            i < rating ? "text-yellow-500" : "text-muted-foreground/30"
          }
        />
      ))}
    </div>
  );
}

function RatingBar({
  star,
  count,
  total,
}: {
  star: number;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 text-right text-xs text-muted-foreground">
        {star}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-yellow-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-4 text-right text-xs tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────

const MAX_RESPONSE_LENGTH = 5970;

export default function ReviewsPage() {
  const { appId } = useParams<{ appId: string }>();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { configured: aiConfigured } = useAIStatus();

  // Data fetching
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [sortBy, setSortBy] = useState("newest");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [territoryFilter, setTerritoryFilter] = useState("all");
  const [hideResponded, setHideResponded] = useState(false);

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
      const url = `/api/apps/${appId}/reviews?sort=${sortBy}${forceRefresh ? "&refresh=1" : ""}`;
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

  // Register with header refresh button – force refresh from ASC
  const handleRefresh = useCallback(() => fetchReviews(true), [fetchReviews]);
  useRegisterRefresh({ onRefresh: handleRefresh, busy: loading });

  // Client-side filtering (sort is server-side via API)
  const territories = useMemo(
    () => [...new Set(reviews.map((r) => r.territory))].sort(),
    [reviews],
  );

  const filtered = useMemo(() => {
    let result = [...reviews];

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
  }, [reviews, ratingFilter, territoryFilter, hideResponded]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [ratingFilter, territoryFilter, hideResponded, sortBy]);

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
    if (!aiConfigured) {
      setShowAIRequired(true);
      return;
    }

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

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "translate",
          text,
          field: "review",
          fromLocale,
          toLocale: "en-US",
        }),
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
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => fetchReviews()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardContent className="flex items-center gap-8 py-0">
          <div>
            <div className="text-4xl font-bold tabular-nums">
              {avgRating.toFixed(1)}
            </div>
            <Stars rating={Math.round(avgRating)} />
            <p className="mt-1 text-xs text-muted-foreground">
              {total} review{total !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex-1 space-y-1.5">
            {distribution.map(({ star, count }) => (
              <RatingBar
                key={star}
                star={star}
                count={count}
                total={total}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[140px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="highest">Highest rated</SelectItem>
            <SelectItem value="lowest">Lowest rated</SelectItem>
          </SelectContent>
        </Select>

        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger className="w-[140px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ratings</SelectItem>
            <SelectItem value="5">5 stars</SelectItem>
            <SelectItem value="4">4 stars</SelectItem>
            <SelectItem value="3">3 stars</SelectItem>
            <SelectItem value="2">2 stars</SelectItem>
            <SelectItem value="1">1 star</SelectItem>
          </SelectContent>
        </Select>

        <Select value={territoryFilter} onValueChange={setTerritoryFilter}>
          <SelectTrigger className="w-[160px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All territories</SelectItem>
            {territories.map((t) => (
              <SelectItem key={t} value={t}>
                {territoryName(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch
            id="hide-responded"
            checked={hideResponded}
            onCheckedChange={setHideResponded}
          />
          <Label htmlFor="hide-responded" className="text-sm">
            Hide responded
          </Label>
        </div>
      </div>

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
                const isTranslating = translating[review.id];

                return (
                  <Card key={review.id}>
                    <CardContent className="space-y-2 py-0">
                      {/* Header: stars + title + date */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <Stars rating={review.rating} size={12} />
                          <p className="text-sm font-semibold">
                            {translated
                              ? translations[review.id].title
                              : review.title}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {new Date(review.createdDate).toLocaleDateString(
                            "en-GB",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            },
                          )}
                        </span>
                      </div>

                      {/* Body */}
                      <p className="text-sm">
                        {translated
                          ? translations[review.id].body
                          : review.body}
                      </p>

                      {/* Translation toggle */}
                      {foreign && (
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                          onClick={() => handleTranslate(review)}
                          disabled={isTranslating}
                        >
                          {isTranslating ? (
                            <CircleNotch
                              size={14}
                              className="animate-spin"
                            />
                          ) : (
                            <Translate size={14} />
                          )}
                          {isTranslating
                            ? "Translating…"
                            : translated
                              ? "Show original"
                              : "Translate"}
                        </button>
                      )}

                      {/* Footer: author + territory + actions */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {review.reviewerNickname} &middot;{" "}
                          {territoryName(review.territory)}
                        </span>
                        <div className="flex items-center gap-2">
                          {review.rating <= 2 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground"
                              onClick={() => handleAppeal(review)}
                            >
                              <WarningCircle size={14} className="mr-1.5" />
                              Appeal review
                            </Button>
                          )}
                          {!review.response && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setReplyTarget(review);
                                setReplyBody("");
                              }}
                            >
                              <ChatText size={14} className="mr-1.5" />
                              Reply
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Developer response */}
                      {review.response && (
                        <div className="rounded-lg border bg-muted/50 px-4 py-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium">
                                Developer response
                              </p>
                              {review.response.state === "PENDING_PUBLISH" && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  Pending
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground"
                                onClick={() => {
                                  setReplyTarget(review);
                                  setReplyBody(review.response!.responseBody);
                                  setEditingResponseId(review.response!.id);
                                }}
                              >
                                <PencilSimple size={12} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteResponse(review.id, review.response!.id)}
                                disabled={deletingResponseId === review.response!.id}
                              >
                                {deletingResponseId === review.response!.id ? (
                                  <CircleNotch size={12} className="animate-spin" />
                                ) : (
                                  <Trash size={12} />
                                )}
                              </Button>
                              <span className="text-xs text-muted-foreground">
                                {new Date(
                                  review.response.lastModifiedDate,
                                ).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </span>
                            </div>
                          </div>
                          <p className="text-sm">
                            {review.response.responseBody}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </PaginatedList>
      )}

      {/* Reply dialog */}
      <Dialog
        open={!!replyTarget}
        onOpenChange={(open) => {
          if (!open) {
            setReplyTarget(null);
            setReplyBody("");
            setEditingResponseId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingResponseId ? "Edit reply" : "Reply to review"}
            </DialogTitle>
            <DialogDescription>
              Your response will be publicly visible on the App Store. It may
              take up to 24 hours to appear after submission.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {replyTarget && (() => {
              const isForeign = NON_ENGLISH_TERRITORIES.has(replyTarget.territory);
              const translated = showTranslation[replyTarget.id] && translations[replyTarget.id];
              const isTranslatingReview = translating[replyTarget.id];
              return (
                <div className="rounded-lg border bg-muted/50 px-4 py-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Stars rating={replyTarget.rating} size={10} />
                    <span className="text-xs text-muted-foreground">
                      {replyTarget.reviewerNickname}
                    </span>
                  </div>
                  <p className="text-sm font-medium">
                    {translated ? translations[replyTarget.id].title : replyTarget.title}
                  </p>
                  <p className="text-sm text-muted-foreground max-h-24 overflow-y-auto">
                    {translated ? translations[replyTarget.id].body : replyTarget.body}
                  </p>
                  {isForeign && (
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      onClick={() => handleTranslate(replyTarget)}
                      disabled={isTranslatingReview}
                    >
                      {isTranslatingReview ? (
                        <CircleNotch size={12} className="animate-spin" />
                      ) : (
                        <Translate size={12} />
                      )}
                      {isTranslatingReview
                        ? "Translating…"
                        : translated
                          ? "Show original"
                          : "Translate"}
                    </button>
                  )}
                </div>
              );
            })()}
            <Textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Write your response…"
              className="min-h-[120px] max-h-[40vh] font-mono text-sm"
              maxLength={MAX_RESPONSE_LENGTH}
            />
            <div className="flex items-center justify-between">
              {replyTarget && NON_ENGLISH_TERRITORIES.has(replyTarget.territory) && replyBody.trim() ? (
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  onClick={handleTranslateReply}
                  disabled={translatingReply}
                >
                  {translatingReply ? (
                    <CircleNotch size={12} className="animate-spin" />
                  ) : (
                    <Translate size={12} />
                  )}
                  {translatingReply ? "Translating…" : "Translate reply"}
                </button>
              ) : (
                <span />
              )}
              <p className="text-xs text-muted-foreground tabular-nums">
                {replyBody.length} / {MAX_RESPONSE_LENGTH}
              </p>
            </div>
          </div>
          <DialogFooter className="flex w-full items-center sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDraftReply}
              disabled={draftingReply}
            >
              {draftingReply ? (
                <CircleNotch size={14} className="mr-1.5 animate-spin" />
              ) : (
                <MagicWand size={14} className="mr-1.5" />
              )}
              Help me write
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setReplyTarget(null);
                  setReplyBody("");
                  setEditingResponseId(null);
                }}
                disabled={replying}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleReply}
                disabled={replying || !replyBody.trim()}
              >
                {replying && (
                  <CircleNotch size={14} className="mr-1.5 animate-spin" />
                )}
                {editingResponseId ? "Update reply" : "Send reply"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appeal dialog */}
      <Dialog
        open={!!appealTarget}
        onOpenChange={(open) => {
          if (!open) {
            setAppealTarget(null);
            setAppealText("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appeal review</DialogTitle>
            <DialogDescription>
              AI-generated appeal text based on the review. Edit if needed, then
              copy and submit via App Store Connect.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {appealTarget && (
              <div className="rounded-lg border bg-muted/50 px-4 py-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Stars rating={appealTarget.rating} size={10} />
                  <span className="text-xs text-muted-foreground">
                    {appealTarget.reviewerNickname}
                  </span>
                </div>
                <p className="text-sm font-medium">{appealTarget.title}</p>
                <p className="text-sm text-muted-foreground">{appealTarget.body}</p>
              </div>
            )}
            {appealLoading ? (
              <div className="flex items-center justify-center py-8">
                <CircleNotch size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Textarea
                value={appealText}
                onChange={(e) => setAppealText(e.target.value)}
                placeholder="Appeal text will appear here…"
                className="min-h-[160px] max-h-[40vh] font-mono text-sm"
              />
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAppealTarget(null);
                setAppealText("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCopyAndOpenASC}
              disabled={appealLoading || !appealText.trim()}
            >
              <Copy size={14} className="mr-1.5" />
              Copy &amp; open App Store Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI required dialog */}
      <AIRequiredDialog
        open={showAIRequired}
        onOpenChange={setShowAIRequired}
      />
    </div>
  );
}
