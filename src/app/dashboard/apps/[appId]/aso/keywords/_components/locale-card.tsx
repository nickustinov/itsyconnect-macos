"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Warning,
  CaretDown,
  CaretUp,
  MagicWand,
  Info,
  CheckCircle,
} from "@phosphor-icons/react";
import { localeName, FIELD_LIMITS } from "@/lib/asc/locale-names";
import { buildForbiddenKeywords } from "@/lib/asc/keyword-utils";
import { KeywordTagInput } from "@/components/keyword-tag-input";
import { CharCount } from "@/components/char-count";
import { AICompareDialog } from "@/components/ai-compare-dialog";
import { useAIStatus } from "@/lib/hooks/use-ai-status";
import { AIRequiredDialog } from "@/components/ai-required-dialog";
import type { LocaleKeywordData, StorefrontAnalysis } from "./keyword-analysis";

interface LocaleCardProps {
  data: LocaleKeywordData;
  analysis: StorefrontAnalysis;
  appName: string | undefined;
  appTitle: string | null;
  appSubtitle: string | null;
  description: string;
  readOnly: boolean;
  isPrimary?: boolean;
  onKeywordsChange: (locale: string, keywords: string) => void;
}

export function LocaleCard({
  data,
  analysis,
  appName,
  appTitle,
  appSubtitle,
  description,
  readOnly,
  isPrimary,
  onKeywordsChange,
}: LocaleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { configured } = useAIStatus();
  const [showAIRequired, setShowAIRequired] = useState(false);
  const [compareState, setCompareState] = useState<{
    title: string;
    apiBody: Record<string, unknown>;
  } | null>(null);

  const budgetPercent = Math.round((data.charsUsed / 100) * 100);

  // Primary locale is the master – don't flag its keywords as cross-locale dupes.
  // Dupes should be fixed in the other locales instead.
  const duplicatesInOtherLocales = useMemo(
    () =>
      isPrimary
        ? []
        : data.keywords.filter((kw) => {
            const locales = analysis.crossLocaleDuplicates.get(kw);
            return locales && locales.length > 1;
          }),
    [data.keywords, analysis.crossLocaleDuplicates, isPrimary],
  );

  const hasOverlaps = data.overlapsWithMetadata.length > 0;
  const hasDuplicates = duplicatesInOtherLocales.length > 0;
  const hasUnusedBudget = data.charsFree > 15;
  const hasIssues = hasOverlaps || hasDuplicates || hasUnusedBudget;
  const noIssues = !hasIssues && data.keywords.length > 0;

  // Build other locales' keywords for AI context
  const otherLocaleKeywords = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ld of analysis.localeData) {
      if (ld.locale !== data.locale && ld.keywordsRaw) {
        map[ld.locale] = ld.keywordsRaw;
      }
    }
    return map;
  }, [analysis.localeData, data.locale]);

  function handleFixWithAI() {
    if (!configured) {
      setShowAIRequired(true);
      return;
    }

    // Pre-process: remove name/subtitle overlaps and cross-locale duplicates
    const overlaps = new Set(data.overlapsWithMetadata.map((w) => w.toLowerCase()));
    const dupes = new Set(duplicatesInOtherLocales.map((w) => w.toLowerCase()));

    const cleanedKeywords = data.keywords
      .filter((kw) => {
        const lower = kw.toLowerCase();
        return !overlaps.has(lower) && !dupes.has(lower);
      })
      .join(",");

    const forbiddenWords = buildForbiddenKeywords({
      appName,
      subtitle: appSubtitle ?? undefined,
      otherLocaleKeywords,
    });

    setCompareState({
      title: `Improve keywords – ${localeName(data.locale)}`,
      apiBody: {
        action: "fix-keywords",
        text: cleanedKeywords,
        field: "keywords",
        locale: data.locale,
        appName: appTitle ?? appName,
        subtitle: appSubtitle,
        charLimit: FIELD_LIMITS.keywords,
        description,
        forbiddenWords,
      },
    });
  }

  // Memoize apiBody to avoid re-triggering the dialog's useEffect
  const compareApiBody = useMemo(() => compareState?.apiBody, [compareState]);

  return (
    <>
      <Card className="gap-0 py-0">
        <CardContent className="py-0">
          {/* Header – always visible */}
          <button
            type="button"
            className="flex w-full items-center gap-3 py-3 text-left"
            onClick={() => setExpanded(!expanded)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {noIssues ? (
                  <CheckCircle size={14} className="text-green-500 shrink-0" weight="fill" />
                ) : hasOverlaps || hasDuplicates ? (
                  <Warning size={14} className="text-amber-500 shrink-0" weight="fill" />
                ) : null}
                <span className="text-sm font-medium">{localeName(data.locale)}</span>
                <span className="text-xs text-muted-foreground">{data.locale}</span>
                {data.resolvedLocale !== data.locale && (
                  <span className="text-xs text-muted-foreground">via {localeName(data.resolvedLocale)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {/* Mini budget bar */}
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${noIssues ? "bg-green-500" : budgetPercent > 90 ? "bg-green-500" : budgetPercent > 50 ? "bg-primary" : "bg-amber-500"}`}
                    style={{ width: `${Math.min(budgetPercent, 100)}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">
                  {data.charsUsed}/100
                </span>
              </div>
              {expanded ? <CaretUp size={14} className="text-muted-foreground" /> : <CaretDown size={14} className="text-muted-foreground" />}
            </div>
          </button>

          {/* Expanded content */}
          {expanded && (
            <div className="space-y-4 pb-4 border-t pt-4">
              {/* Editable keywords */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Keywords</span>
                  <CharCount value={data.keywordsRaw} limit={FIELD_LIMITS.keywords} />
                </div>
                <Card className="gap-0 py-0">
                  <CardContent className="py-3">
                    <KeywordTagInput
                      value={data.keywordsRaw}
                      onChange={(v) => onKeywordsChange(data.resolvedLocale, v)}
                      readOnly={readOnly}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Issues + fix button */}
              {hasIssues && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {hasOverlaps && (
                      <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2">
                        <Warning size={14} className="mt-0.5 shrink-0 text-amber-500" weight="fill" />
                        <p className="text-sm text-amber-700 dark:text-amber-400">
                          {data.overlapsWithMetadata.map((kw) => `"${kw}"`).join(", ")}{" "}
                          {data.overlapsWithMetadata.length === 1 ? "overlaps" : "overlap"} with your
                          app name or subtitle &ndash; Apple auto-indexes those, wasting keyword space.
                        </p>
                      </div>
                    )}
                    {hasDuplicates && (
                      <div className="flex items-start gap-2 rounded-md bg-blue-500/10 px-3 py-2">
                        <Warning size={14} className="mt-0.5 shrink-0 text-blue-500" weight="fill" />
                        <p className="text-sm text-blue-700 dark:text-blue-400">
                          {duplicatesInOtherLocales.map((kw) => `"${kw}"`).join(", ")}{" "}
                          also {duplicatesInOtherLocales.length === 1 ? "appears" : "appear"} in other
                          locales for this storefront &ndash; no ranking boost from repetition.
                        </p>
                      </div>
                    )}
                    {hasUnusedBudget && (
                      <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2">
                        <Info size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          {data.charsFree} characters unused &ndash; room for more keywords.
                        </p>
                      </div>
                    )}
                  </div>

                  {!readOnly && (
                    <Button variant="outline" size="sm" onClick={handleFixWithAI}>
                      <MagicWand size={14} className="mr-1.5" />
                      Fix issues
                    </Button>
                  )}
                </div>
              )}

              {/* All good state */}
              {noIssues && (
                <div className="flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-2">
                  <CheckCircle size={14} className="shrink-0 text-green-600 dark:text-green-400" weight="fill" />
                  <p className="text-sm text-green-700 dark:text-green-400">
                    No issues &ndash; budget well used, no overlaps or duplicates.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AIRequiredDialog open={showAIRequired} onOpenChange={setShowAIRequired} />
      <AICompareDialog
        open={!!compareState}
        onOpenChange={(open) => { if (!open) setCompareState(null); }}
        title={compareState?.title ?? ""}
        currentValue={data.keywordsRaw}
        apiBody={compareApiBody}
        singleLine
        charLimit={FIELD_LIMITS.keywords}
        onApply={(value) => onKeywordsChange(data.resolvedLocale, value)}
      />
    </>
  );
}
