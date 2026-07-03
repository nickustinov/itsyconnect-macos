"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info, ArrowRight } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { localeName } from "@/lib/asc/locale-names";
import {
  STOREFRONTS,
  storefrontLocales as getStorefrontLocales,
  storefrontsByLocale,
} from "@/lib/asc/storefronts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useKeywords } from "../_components/keywords-context";
import { analyzeStorefront } from "../_components/keyword-analysis";
import { OverviewCard } from "../_components/overview-card";
import { LocaleCard } from "../_components/locale-card";
import { StorefrontPicker } from "../_components/storefront-picker";
import { useTranslations } from "@/lib/i18n/locale-context";

export default function KeywordsStorefrontPage() {
  const t = useTranslations();
  const {
    app, editedLocalizations, infoLocalizations, readOnly, loading, noVersions,
    handleKeywordsChange, getTitle, getSubtitle, getDescription,
  } = useKeywords();

  const defaultStorefront = useMemo(() => {
    const primaryLocale = app?.primaryLocale ?? "en-US";
    const candidates = storefrontsByLocale(primaryLocale);
    if (candidates.includes("USA") && primaryLocale === "en-US") return "USA";
    return candidates[0] ?? "USA";
  }, [app?.primaryLocale]);

  const [storefront, setStorefront] = useState<string>(defaultStorefront);

  const sfAnalysis = useMemo(() => {
    if (loading) return null;
    const sfLocales = getStorefrontLocales(storefront);
    return analyzeStorefront(sfLocales, editedLocalizations, infoLocalizations);
  }, [storefront, editedLocalizations, infoLocalizations, loading]);

  const sfInfo = STOREFRONTS[storefront];

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

  if (!sfAnalysis) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <StorefrontPicker value={storefront} onChange={setStorefront} />
      </div>

      <OverviewCard
        analysis={sfAnalysis}
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
        header={<p className="text-sm font-medium">{t("keywords.storefrontAppStore", { name: sfInfo?.name ?? "" })}</p>}
      >
        <p className="text-sm text-muted-foreground">
          {sfAnalysis.indexedLocales.length === 1
            ? t("keywords.indexesFromLocales", { count: sfAnalysis.indexedLocales.length })
            : t("keywords.indexesFromLocalesPlural", { count: sfAnalysis.indexedLocales.length })}
          {sfAnalysis.missingLocales.length > 0 && (
            <>
              {" "}
              {t("keywords.localizedCount", {
                active: sfAnalysis.activeLocales.length,
                total: sfAnalysis.indexedLocales.length,
              })}
            </>
          )}
        </p>
      </OverviewCard>

      {/* Locale cards */}
      {sfAnalysis.localeData.length > 0 && (
        <section className="space-y-3">
          <h3 className="section-title">{t("keywords.indexedLocales")}</h3>
          {sfAnalysis.localeData.map((ld) => (
            <LocaleCard
              key={ld.locale}
              data={ld}
              analysis={sfAnalysis}
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
      )}

      {/* Untapped locales */}
      {sfAnalysis.missingLocales.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="section-title">{t("keywords.untappedLocales")}</h3>
            <Tooltip>
              <TooltipTrigger>
                <Info size={16} className="text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                {t("keywords.untappedTooltip", { storefront: sfInfo?.name ?? "" })}
              </TooltipContent>
            </Tooltip>
          </div>

          <Card className="gap-0 py-0">
            <CardContent className="py-4">
              <div className="space-y-3">
                {sfAnalysis.missingLocales.map((locale) => {
                  const reachCount = storefrontsByLocale(locale).length;
                  return (
                    <div key={locale} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{localeName(locale)}</p>
                        <p className="text-sm text-muted-foreground">
                          {reachCount === 1
                            ? t("keywords.charsIndexedIn", { count: reachCount })
                            : t("keywords.charsIndexedInPlural", { count: reachCount })}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-muted-foreground">
                        {t("keywords.addInStoreListing")}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Cross-locale duplicates */}
      {sfAnalysis.crossLocaleDuplicates.size > 0 && (
        <section className="space-y-3">
          <h3 className="section-title">{t("keywords.crossLocaleDuplicates")}</h3>
          <Card className="gap-0 py-0">
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground mb-3">
                {t("keywords.storefrontDuplicatesHint")}
              </p>
              <div className="space-y-2">
                {[...sfAnalysis.crossLocaleDuplicates.entries()].map(
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
