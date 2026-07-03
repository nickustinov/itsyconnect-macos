"use client";

import { useApps } from "@/lib/apps-context";
import { useRouter } from "next/navigation";
import { WarningCircle, CircleNotch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/locale-context";
import { resolveConnectionErrorMessage } from "@/lib/i18n/resolve-connection-error";

export function ConnectionBanner() {
  const { error, loading, refresh } = useApps();
  const router = useRouter();
  const t = useTranslations();

  if (!error) return null;

  const isAuth = error.category === "auth";

  return (
    <div className="flex items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm">
      <WarningCircle size={16} className="shrink-0 text-destructive" />
      <span className="flex-1">{resolveConnectionErrorMessage(error, t)}</span>
      {isAuth ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/settings")}
        >
          {t("banners.checkCredentials")}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => refresh()}
        >
          {loading ? (
            <CircleNotch size={14} className="mr-1.5 animate-spin" />
          ) : null}
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}
