"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CharCount } from "@/components/char-count";
import { KeywordTagInput } from "@/components/keyword-tag-input";
import { FIELD_LIMITS, FIELD_MIN_LIMITS } from "@/lib/asc/locale-names";
import { splitMetaWords } from "@/lib/asc/keyword-utils";
import { MagicWandButton, wandProps } from "@/components/magic-wand-button";
import type { MagicWandLocaleProps } from "@/components/magic-wand-button";
import { useTranslations } from "@/lib/i18n/locale-context";

function KeywordTip({ keywords, appName, subtitle, otherLocaleKeywords }: {
  keywords: string;
  appName?: string;
  subtitle?: string;
  otherLocaleKeywords?: Record<string, string>;
}) {
  const t = useTranslations();
  const len = keywords.length;
  const free = FIELD_LIMITS.keywords - len;

  if (len === 0) {
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
        {t("storeListing.keywords.empty")}
      </Badge>
    );
  }

  const metaWords = new Set<string>([
    ...(appName ? splitMetaWords(appName) : []),
    ...(subtitle ? splitMetaWords(subtitle) : []),
  ]);

  const kws = keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  const overlaps = kws.filter((kw) => kw.split(/\s+/).some((w) => metaWords.has(w)));

  const otherKws = new Set(
    Object.values(otherLocaleKeywords ?? {})
      .flatMap((raw) => raw.split(",").map((w) => w.trim().toLowerCase()))
      .filter(Boolean),
  );
  const dupes = kws.filter((kw) => otherKws.has(kw));

  const issues: string[] = [];
  if (overlaps.length > 0) {
    issues.push(
      overlaps.length > 1
        ? t("storeListing.keywords.overlapsPlural", { count: overlaps.length })
        : t("storeListing.keywords.overlaps", { count: overlaps.length }),
    );
  }
  if (dupes.length > 0) {
    issues.push(
      dupes.length > 1
        ? t("storeListing.keywords.dupesPlural", { count: dupes.length })
        : t("storeListing.keywords.dupes", { count: dupes.length }),
    );
  }
  if (issues.length === 0 && free <= 15) return null;

  const badges: React.ReactNode[] = [];
  if (issues.length > 0) {
    badges.push(
      <Badge key="issues" variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600 dark:text-amber-400">
        {issues.join(", ")}
      </Badge>,
    );
  }
  if (free > 15) {
    badges.push(
      <Badge key="free" variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600 dark:text-amber-400">
        {t("storeListing.keywords.charsFree", { count: free })}
      </Badge>,
    );
  }
  return <>{badges}</>;
}

export interface LocaleFields {
  description: string;
  keywords: string;
  whatsNew: string;
  promotionalText: string;
  supportUrl: string;
  marketingUrl: string;
}

export function emptyLocaleFields(): LocaleFields {
  return {
    description: "",
    keywords: "",
    whatsNew: "",
    promotionalText: "",
    supportUrl: "",
    marketingUrl: "",
  };
}

export function LocaleFieldsSection({
  current,
  localeTag,
  readOnly,
  onFieldChange,
  wand,
  onBulkAllMode,
  hideWhatsNew,
  keywordsInsightsHref,
}: {
  current: LocaleFields;
  localeTag: ReactNode;
  readOnly: boolean;
  onFieldChange: (field: keyof LocaleFields, value: string) => void;
  wand: MagicWandLocaleProps;
  onBulkAllMode: (field: string) => void;
  hideWhatsNew?: boolean;
  keywordsInsightsHref?: string;
}) {
  const t = useTranslations();

  return (
    <>
      {!hideWhatsNew && <section className="space-y-2">
        <div className="flex items-center gap-1">
          <h3 className="section-title">{t("storeListing.fields.whatsNew")}{localeTag}</h3>
          <MagicWandButton
            value={current.whatsNew}
            onChange={(v) => onFieldChange("whatsNew", v)}
            {...wandProps(wand, "whatsNew")}
            charLimit={FIELD_LIMITS.whatsNew}
            disabled={readOnly}
            onTranslateAll={() => onBulkAllMode("whatsNew")}
          />
        </div>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <Textarea
              value={current.whatsNew}
              onChange={(e) => onFieldChange("whatsNew", e.target.value)}
              readOnly={readOnly}
              placeholder={t("storeListing.fields.whatsNewPlaceholder")}
              className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none text-sm min-h-0 dark:bg-transparent"
            />
          </CardContent>
          <div className="flex items-center rounded-b-xl border-t bg-sidebar px-3 py-1.5">
            <CharCount
              value={current.whatsNew}
              limit={FIELD_LIMITS.whatsNew}
              min={FIELD_MIN_LIMITS.whatsNew}
            />
          </div>
        </Card>
      </section>}

      <section className="space-y-2">
        <div className="flex items-center gap-1">
          <h3 className="section-title">{t("storeListing.fields.promotionalText")}{localeTag}</h3>
          <MagicWandButton
            value={current.promotionalText}
            onChange={(v) => onFieldChange("promotionalText", v)}
            {...wandProps(wand, "promotionalText")}
            charLimit={FIELD_LIMITS.promotionalText}
            onTranslateAll={() => onBulkAllMode("promotionalText")}
          />
        </div>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <Textarea
              value={current.promotionalText}
              onChange={(e) =>
                onFieldChange("promotionalText", e.target.value)
              }
              placeholder={t("storeListing.fields.promotionalTextPlaceholder")}
              className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none text-sm min-h-0 dark:bg-transparent"
            />
          </CardContent>
          <div className="flex items-center rounded-b-xl border-t bg-sidebar px-3 py-1.5">
            <CharCount
              value={current.promotionalText}
              limit={FIELD_LIMITS.promotionalText}
            />
          </div>
        </Card>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1">
          <h3 className="section-title">{t("storeListing.fields.description")}{localeTag}</h3>
          <MagicWandButton
            value={current.description}
            onChange={(v) => onFieldChange("description", v)}
            {...wandProps(wand, "description")}
            charLimit={FIELD_LIMITS.description}
            disabled={readOnly}
            onTranslateAll={() => onBulkAllMode("description")}
          />
        </div>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <Textarea
              value={current.description}
              onChange={(e) => onFieldChange("description", e.target.value)}
              readOnly={readOnly}
              placeholder={t("storeListing.fields.descriptionPlaceholder")}
              className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none text-sm min-h-0 dark:bg-transparent"
            />
          </CardContent>
          <div className="flex items-center rounded-b-xl border-t bg-sidebar px-3 py-1.5">
            <CharCount
              value={current.description}
              limit={FIELD_LIMITS.description}
              min={FIELD_MIN_LIMITS.description}
            />
          </div>
        </Card>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1">
          <h3 className="section-title">{t("storeListing.fields.keywords")}{localeTag}</h3>
          <MagicWandButton
            value={current.keywords}
            onChange={(v) => onFieldChange("keywords", v)}
            {...wandProps(wand, "keywords")}
            charLimit={FIELD_LIMITS.keywords}
            disabled={readOnly}
            keywordsInsightsHref={keywordsInsightsHref}
          />
          <KeywordTip
            keywords={current.keywords}
            appName={wand.appName}
            subtitle={wand.appInfoData?.[wand.locale]?.subtitle ?? undefined}
            otherLocaleKeywords={(() => {
              const map: Record<string, string> = {};
              for (const [loc, data] of Object.entries(wand.localeData)) {
                if (loc !== wand.locale && data?.keywords) map[loc] = data.keywords as string;
              }
              return map;
            })()}
          />
        </div>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <KeywordTagInput
              value={current.keywords}
              onChange={(v) => onFieldChange("keywords", v)}
              readOnly={readOnly}
            />
          </CardContent>
          <div className="flex items-center rounded-b-xl border-t bg-sidebar px-3 py-1.5">
            <CharCount
              value={current.keywords}
              limit={FIELD_LIMITS.keywords}
            />
          </div>
        </Card>
      </section>

      <section className="space-y-2">
        <h3 className="section-title">{t("storeListing.fields.urls")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              {t("storeListing.fields.supportUrl")}{localeTag}
            </label>
            <Input
              dir="ltr"
              value={current.supportUrl}
              onChange={(e) => onFieldChange("supportUrl", e.target.value)}
              readOnly={readOnly}
              placeholder="https://..."
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              {t("storeListing.fields.marketingUrl")}{localeTag}
            </label>
            <Input
              dir="ltr"
              value={current.marketingUrl}
              onChange={(e) => onFieldChange("marketingUrl", e.target.value)}
              readOnly={readOnly}
              placeholder="https://..."
              className="text-sm"
            />
          </div>
        </div>
      </section>
    </>
  );
}
