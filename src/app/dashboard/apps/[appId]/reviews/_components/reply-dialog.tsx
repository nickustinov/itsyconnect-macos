"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Translate,
  CircleNotch,
  MagicWand,
} from "@phosphor-icons/react";
import { GuidanceField } from "@/components/guidance-field";
import { Stars } from "./review-summary";
import { NON_ENGLISH_TERRITORIES } from "./territory-helpers";
import type { Review } from "./territory-helpers";
import { useTranslations } from "@/lib/i18n/locale-context";

const MAX_RESPONSE_LENGTH = 5970;

interface ReplyDialogProps {
  replyTarget: Review | null;
  replyBody: string;
  onReplyBodyChange: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
  replying: boolean;
  editingResponseId: string | null;
  onDraftReply: () => void;
  draftingReply: boolean;
  guidance: string;
  onGuidanceChange: (value: string) => void;
  onGuidanceBlur: () => void;
  onTranslateReply: () => void;
  translatingReply: boolean;
  translations: Record<string, { title: string; body: string }>;
  showTranslation: Record<string, boolean>;
  onTranslate: (review: Review) => void;
  translating: Record<string, boolean>;
}

export function ReplyDialog({
  replyTarget,
  replyBody,
  onReplyBodyChange,
  onClose,
  onSend,
  replying,
  editingResponseId,
  onDraftReply,
  draftingReply,
  guidance,
  onGuidanceChange,
  onGuidanceBlur,
  onTranslateReply,
  translatingReply,
  translations,
  showTranslation,
  onTranslate,
  translating,
}: ReplyDialogProps) {
  const t = useTranslations();

  return (
    <Dialog
      open={!!replyTarget}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editingResponseId ? t("reviews.editReply") : t("reviews.replyToReview")}
          </DialogTitle>
          <DialogDescription>
            {t("reviews.replyDescription")}
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
                    onClick={() => onTranslate(replyTarget)}
                    disabled={isTranslatingReview}
                  >
                    {isTranslatingReview ? (
                      <CircleNotch size={12} className="animate-spin" />
                    ) : (
                      <Translate size={12} />
                    )}
                    {isTranslatingReview
                      ? t("reviews.translating")
                      : translated
                        ? t("reviews.showOriginal")
                        : t("reviews.translate")}
                  </button>
                )}
              </div>
            );
          })()}
          <Textarea
            value={replyBody}
            onChange={(e) => onReplyBodyChange(e.target.value)}
            placeholder={t("reviews.replyPlaceholder")}
            className="min-h-[120px] max-h-[40vh] font-mono text-sm"
            maxLength={MAX_RESPONSE_LENGTH}
          />
          <div className="flex items-center justify-between">
            {replyTarget && NON_ENGLISH_TERRITORIES.has(replyTarget.territory) && replyBody.trim() ? (
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                onClick={onTranslateReply}
                disabled={translatingReply}
              >
                {translatingReply ? (
                  <CircleNotch size={12} className="animate-spin" />
                ) : (
                  <Translate size={12} />
                )}
                {translatingReply ? t("reviews.translating") : t("reviews.translateReply")}
              </button>
            ) : (
              <span />
            )}
            <p className="text-xs text-muted-foreground tabular-nums">
              {replyBody.length} / {MAX_RESPONSE_LENGTH}
            </p>
          </div>
          <GuidanceField
            value={guidance}
            onChange={onGuidanceChange}
            onBlur={onGuidanceBlur}
          />
        </div>
        <DialogFooter className="flex w-full items-center sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={onDraftReply}
            disabled={draftingReply}
          >
            {draftingReply ? (
              <CircleNotch size={14} className="mr-1.5 animate-spin" />
            ) : (
              <MagicWand size={14} className="mr-1.5" />
            )}
            {t("reviews.helpMeWrite")}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={replying}
            >
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={onSend}
              disabled={replying || !replyBody.trim()}
            >
              {replying && (
                <CircleNotch size={14} className="mr-1.5 animate-spin" />
              )}
              {editingResponseId ? t("reviews.updateReply") : t("reviews.sendReply")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
