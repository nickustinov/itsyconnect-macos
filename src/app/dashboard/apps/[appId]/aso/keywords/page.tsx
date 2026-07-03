"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { localeName } from "@/lib/asc/locale-names";
import { useKeywords } from "./_components/keywords-context";
import { OverviewCard } from "./_components/overview-card";
import { LocaleCard } from "./_components/locale-card";
import { useTranslations } from "@/lib/i18n/locale-context";

export default function KeywordsLocalesPage() {
  const t = useTranslations();
  const {
    app, localeAnalysis, readOnly, loading, noVersions,
    handleKeywordsChange, getTitle, getSubtitle, getDescription,
  } = useKeywords();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (noVersions) {
    return (
      <EmptyState
        title={t("storeListing.noVersions")}
        description={t("keywords.noVersionsDescription")}
      />
    );
  }

  if (!localeAnalysis || localeAnalysis.localeData.length === 0) {
    return (
      <EmptyState
        title={t("storeListing.noLocalizations")}
        description={t("keywords.noLocalizationsDescription")}
      />
    );
  }

  return (
    <div className="space-y-6">
      <OverviewCard
        analysis={localeAnalysis}
        readOnly={readOnly}
        appName={app?.name}
        primaryLocale={app?.primaryLocale}
        getTitle={getTitle}
        getSubtitle={getSubtitle}
        getDescription={getDescription}
        onApplyFixes={(updates) => {
          for (const [locale, kw] of Object.entries(updates)) {
            handleKeywordsChange(locale, kw);
          }
        }}
      >
        <p className="text-sm text-muted-foreground">
          {localeAnalysis.localeData.length === 1
            ? t("keywords.localesWithKeywords", { count: localeAnalysis.localeData.length })
            : t("keywords.localesWithKeywordsPlural", { count: localeAnalysis.localeData.length })}
        </p>
      </OverviewCard>

      <section className="space-y-3">
        {localeAnalysis.localeData.map((ld) => (
          <LocaleCard
            key={ld.locale}
            data={ld}
            analysis={localeAnalysis}
            appName={app?.name}
            appTitle={getTitle(ld.locale)}
            appSubtitle={getSubtitle(ld.locale)}
            description={getDescription(ld.locale)}
            readOnly={readOnly}
            isPrimary={ld.resolvedLocale === app?.primaryLocale}
            onKeywordsChange={handleKeywordsChange}
          />
        ))}
      </section>

      {localeAnalysis.crossLocaleDuplicates.size > 0 && (
        <section className="space-y-3">
          <h3 className="section-title">{t("keywords.crossLocaleDuplicates")}</h3>
          <Card className="gap-0 py-0">
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground mb-3">
                {t("keywords.crossLocaleDuplicatesHint")}
              </p>
              <div className="space-y-2">
                {[...localeAnalysis.crossLocaleDuplicates.entries()].map(
                  ([kw, locales]) => (
                    <div key={kw} className="flex items-center gap-2">
                      <Badge variant="secondary">{kw}</Badge>
                      <ArrowRight size={12} className="text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {locales.map((l) => localeName(l)).join(", ")}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
