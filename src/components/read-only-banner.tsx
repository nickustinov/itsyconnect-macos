"use client";

import { Lock } from "@phosphor-icons/react";
import { useTranslations } from "@/lib/i18n/locale-context";

const REVIEW_STATES = new Set(["WAITING_FOR_REVIEW", "IN_REVIEW"]);

export function ReadOnlyBanner({
  state,
  liveMessage,
}: {
  state: string;
  liveMessage?: string;
}) {
  const t = useTranslations();

  let message: string;
  if (REVIEW_STATES.has(state)) {
    message = t("banners.readOnlyInReview");
  } else if (state === "PENDING_DEVELOPER_RELEASE") {
    message = t("banners.readOnlyPendingRelease");
  } else {
    message = liveMessage ?? t("banners.readOnlyLive");
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
      <Lock size={16} className="shrink-0" />
      {message}
    </div>
  );
}
