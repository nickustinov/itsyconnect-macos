"use client";

"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/locale-context";

interface ErrorStateProps {
  message?: string;
  onRetry: () => void;
}

/**
 * Vertically centred error state with retry button.
 * Must be rendered inside a flex column with flex-1.
 */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const t = useTranslations();

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
        <WarningCircle size={24} className="text-muted-foreground" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {t("errors.ascUnreachable")}
      </p>
      {message && (
        <p className="mt-1 text-xs text-muted-foreground/60">
          {t("errors.errorPrefix")} {message}
        </p>
      )}
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        {t("common.retry")}
      </Button>
    </div>
  );
}
