"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { type Review, territoryToLocale } from "./territory-helpers";
import { useTranslations } from "@/lib/i18n/locale-context";

/** Resolve which app (and its display name) a review belongs to. */
export type ResolveApp = (review: Review) => { appId: string; appName?: string };

interface UseReviewActionsOptions<T extends Review> {
  setReviews: Dispatch<SetStateAction<T[]>>;
  resolveApp: ResolveApp;
  aiConfigured: boolean;
  reviewGuidance: string;
}

/**
 * All per-review action state and handlers (translate, reply, draft, appeal,
 * delete), parameterised by `resolveApp` so the same logic powers both the
 * per-app reviews page and the cross-app review center. Each handler routes to
 * the API for the review's own app.
 */
export function useReviewActions<T extends Review>({
  setReviews,
  resolveApp,
  aiConfigured,
  reviewGuidance,
}: UseReviewActionsOptions<T>) {
  const t = useTranslations();

  // Translation state
  const [translations, setTranslations] = useState<
    Record<string, { title: string; body: string }>
  >({});
  const [translating, setTranslating] = useState<Record<string, boolean>>({});
  const [showTranslation, setShowTranslation] = useState<Record<string, boolean>>({});

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

  // AI required dialog
  const [showAIRequired, setShowAIRequired] = useState(false);

  async function handleTranslate(review: Review) {
    // Already translated – just toggle visibility
    if (translations[review.id]) {
      setShowTranslation((prev) => ({ ...prev, [review.id]: !prev[review.id] }));
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
        throw new Error(data.error ?? t("reviews.toastTranslationFailed"));
      }

      const { result } = await res.json();
      const parts = result.split("\n\n");
      const title = parts[0] ?? review.title;
      const body = parts.slice(1).join("\n\n") || parts[0] || review.body;

      setTranslations((prev) => ({ ...prev, [review.id]: { title, body } }));
      setShowTranslation((prev) => ({ ...prev, [review.id]: true }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("reviews.toastTranslationFailed"));
    } finally {
      setTranslating((prev) => ({ ...prev, [review.id]: false }));
    }
  }

  async function handleReply() {
    if (!replyTarget || !replyBody.trim()) return;
    const { appId } = resolveApp(replyTarget);

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
        throw new Error(data.error ?? (isEdit ? t("reviews.toastUpdateReplyFailed") : t("reviews.toastSendReplyFailed")));
      }

      const data = await res.json();

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
        isEdit ? t("reviews.toastReplyUpdated") : t("reviews.toastReplySent"),
      );
      setReplyTarget(null);
      setReplyBody("");
      setEditingResponseId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("reviews.toastSendReplyFailed"));
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
    const { appName } = resolveApp(replyTarget);

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
          appName,
          guidance: reviewGuidance,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "ai_not_configured") {
          setShowAIRequired(true);
          return;
        }
        throw new Error(data.error ?? t("reviews.toastGenerateReplyFailed"));
      }

      const { result } = await res.json();
      setReplyBody(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("reviews.toastGenerateReplyFailed"));
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
        throw new Error(data.error ?? t("reviews.toastTranslationFailed"));
      }

      const { result } = await res.json();
      setReplyBody(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("reviews.toastTranslationFailed"));
    } finally {
      setTranslatingReply(false);
    }
  }

  async function handleAppeal(review: Review) {
    if (!aiConfigured) {
      setShowAIRequired(true);
      return;
    }
    const { appName } = resolveApp(review);

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
          appName,
          guidance: reviewGuidance,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "ai_not_configured") {
          setAppealTarget(null);
          setShowAIRequired(true);
          return;
        }
        throw new Error(data.error ?? t("reviews.toastGenerateAppealFailed"));
      }

      const { result } = await res.json();
      setAppealText(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("reviews.toastGenerateAppealFailed"));
      setAppealTarget(null);
    } finally {
      setAppealLoading(false);
    }
  }

  async function handleCopyAndOpenASC() {
    try {
      await navigator.clipboard.writeText(appealText);
      window.open("https://appstoreconnect.apple.com", "_blank");
      toast.success(t("reviews.toastAppealCopied"));
      setAppealTarget(null);
      setAppealText("");
    } catch {
      toast.error(t("reviews.toastCopyFailed"));
    }
  }

  async function handleDeleteResponse(review: Review, responseId: string) {
    const { appId } = resolveApp(review);
    setDeletingResponseId(responseId);
    try {
      const res = await fetch(`/api/apps/${appId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", responseId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("reviews.toastDeleteResponseFailed"));
      }

      setReviews((prev) =>
        prev.map((r) => (r.id === review.id ? { ...r, response: undefined } : r)),
      );
      toast.success(t("reviews.toastResponseDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("reviews.toastDeleteResponseFailed"));
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

  return {
    // Per-card state + handlers
    translations,
    translating,
    showTranslation,
    deletingResponseId,
    onTranslate: handleTranslate,
    onReply: handleOpenReply,
    onEdit: handleOpenEditReply,
    onAppeal: handleAppeal,
    onDeleteResponse: handleDeleteResponse,

    // Reply dialog
    replyTarget,
    replyBody,
    setReplyBody,
    replying,
    editingResponseId,
    onSendReply: handleReply,
    onDraftReply: handleDraftReply,
    draftingReply,
    onTranslateReply: handleTranslateReply,
    translatingReply,
    onCloseReply: handleCloseReplyDialog,

    // Appeal dialog
    appealTarget,
    appealText,
    setAppealText,
    appealLoading,
    onCopyAndOpen: handleCopyAndOpenASC,
    onCloseAppeal: handleCloseAppealDialog,

    // AI required dialog
    showAIRequired,
    setShowAIRequired,
  };
}

export type ReviewActions<T extends Review> = ReturnType<typeof useReviewActions<T>>;
