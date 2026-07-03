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
import { CircleNotch, Copy } from "@phosphor-icons/react";
import { Stars } from "./review-summary";
import type { Review } from "./territory-helpers";
import { useTranslations } from "@/lib/i18n/locale-context";

interface AppealDialogProps {
  appealTarget: Review | null;
  appealText: string;
  onAppealTextChange: (value: string) => void;
  appealLoading: boolean;
  onClose: () => void;
  onCopyAndOpen: () => void;
}

export function AppealDialog({
  appealTarget,
  appealText,
  onAppealTextChange,
  appealLoading,
  onClose,
  onCopyAndOpen,
}: AppealDialogProps) {
  const t = useTranslations();

  return (
    <Dialog
      open={!!appealTarget}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reviews.appealReview")}</DialogTitle>
          <DialogDescription>
            {t("reviews.appealDescription")}
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
              onChange={(e) => onAppealTextChange(e.target.value)}
              placeholder={t("reviews.appealPlaceholder")}
              className="min-h-[160px] max-h-[40vh] font-mono text-sm"
            />
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={onCopyAndOpen}
            disabled={appealLoading || !appealText.trim()}
          >
            <Copy size={14} className="mr-1.5" />
            {t("reviews.copyAndOpenAsc")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
