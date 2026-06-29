"use client";

import { AIRequiredDialog } from "@/components/ai-required-dialog";
import { ReplyDialog } from "./reply-dialog";
import { AppealDialog } from "./appeal-dialog";
import type { Review } from "./territory-helpers";
import type { ReviewActions } from "./use-review-actions";

interface ReviewActionDialogsProps<T extends Review> {
  actions: ReviewActions<T>;
  guidance: string;
  onGuidanceChange: (value: string) => void;
  onGuidanceBlur: () => void;
}

/** Reply, appeal, and AI-required dialogs wired to a useReviewActions instance. */
export function ReviewActionDialogs<T extends Review>({
  actions,
  guidance,
  onGuidanceChange,
  onGuidanceBlur,
}: ReviewActionDialogsProps<T>) {
  return (
    <>
      <ReplyDialog
        replyTarget={actions.replyTarget}
        replyBody={actions.replyBody}
        onReplyBodyChange={actions.setReplyBody}
        onClose={actions.onCloseReply}
        onSend={actions.onSendReply}
        replying={actions.replying}
        editingResponseId={actions.editingResponseId}
        onDraftReply={actions.onDraftReply}
        draftingReply={actions.draftingReply}
        guidance={guidance}
        onGuidanceChange={onGuidanceChange}
        onGuidanceBlur={onGuidanceBlur}
        onTranslateReply={actions.onTranslateReply}
        translatingReply={actions.translatingReply}
        translations={actions.translations}
        showTranslation={actions.showTranslation}
        onTranslate={actions.onTranslate}
        translating={actions.translating}
      />

      <AppealDialog
        appealTarget={actions.appealTarget}
        appealText={actions.appealText}
        onAppealTextChange={actions.setAppealText}
        appealLoading={actions.appealLoading}
        onClose={actions.onCloseAppeal}
        onCopyAndOpen={actions.onCopyAndOpen}
      />

      <AIRequiredDialog
        open={actions.showAIRequired}
        onOpenChange={actions.setShowAIRequired}
      />
    </>
  );
}
