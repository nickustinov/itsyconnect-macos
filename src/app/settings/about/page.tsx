"use client";

import Image from "next/image";
import { GithubLogo } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { APP_VERSION, BUILD_NUMBER } from "@/lib/version";
import { useTranslations } from "@/lib/i18n/locale-context";

export default function AboutPage() {
  const t = useTranslations();

  return (
    <div className="max-w-2xl space-y-6">
      <Image
        src="/icon.png"
        alt="Itsyconnect"
        width={64}
        height={64}
        className="rounded-xl"
      />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Itsyconnect</h2>
        <a
          href="https://itsyconnect.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:underline underline-offset-4"
        >
          https://itsyconnect.com
        </a>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <span className="text-muted-foreground">{t("settings.about.version")}</span>
          <p className="font-mono text-xs mt-0.5">{APP_VERSION}</p>
        </div>
        <div>
          <span className="text-muted-foreground">{t("settings.about.build")}</span>
          <p className="font-mono text-xs mt-0.5">{BUILD_NUMBER}</p>
        </div>
      </div>

      <Button variant="outline" size="sm" asChild>
        <a
          href="https://github.com/nickustinov/itsyconnect-macos/issues/new"
          target="_blank"
          rel="noopener noreferrer"
        >
          <GithubLogo size={16} />
          {t("settings.about.reportIssue")}
        </a>
      </Button>
    </div>
  );
}
