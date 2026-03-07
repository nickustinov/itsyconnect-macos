"use client";

import { useState, useEffect, useRef } from "react";
import { Check, Warning, CircleNotch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { localeName, FIELD_LIMITS } from "@/lib/asc/locale-names";
import { buildForbiddenKeywords } from "@/lib/asc/keyword-utils";
import { CharCount } from "@/components/char-count";
import type { LocaleKeywordData, StorefrontAnalysis } from "./keyword-analysis";

interface FixAllDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysis: StorefrontAnalysis;
  appName: string | undefined;
  primaryLocale?: string;
  appTitle: (locale: string) => string | null;
  appSubtitle: (locale: string) => string | null;
  description: (locale: string) => string;
  onApply: (updates: Record<string, string>) => void;
}

type Status = "pending" | "loading" | "done" | "error";

interface LocaleResult {
  status: Status;
  value: string;
}

function buildForbiddenWords(
  locale: string,
  analysis: StorefrontAnalysis,
  appName: string | undefined,
  appSubtitle: string | null,
): string[] {
  return buildForbiddenKeywords({
    appName,
    subtitle: appSubtitle ?? undefined,
    otherLocaleKeywords: analysis.localeData
      .filter((ld) => ld.locale !== locale)
      .map((ld) => ld.keywords.join(",")),
  });
}

function cleanKeywords(
  data: LocaleKeywordData,
  primaryKeywords?: Set<string>,
  claimedKeywords?: Set<string>,
): string {
  const overlaps = new Set(data.overlapsWithMetadata.map((w) => w.toLowerCase()));
  return data.keywords
    .filter((kw) => {
      const lower = kw.toLowerCase();
      // Remove name/subtitle overlaps (auto-indexed by Apple)
      if (overlaps.has(lower)) return false;
      // For non-primary locales: remove keywords that duplicate the primary locale
      if (primaryKeywords?.has(lower)) return false;
      // Remove keywords already claimed by a previously-processed locale
      if (claimedKeywords?.has(lower)) return false;
      return true;
    })
    .join(",");
}

function localeHasIssues(data: LocaleKeywordData, analysis: StorefrontAnalysis, isPrimary: boolean): boolean {
  // Primary locale is the master – don't count cross-locale dupes as issues
  const hasDupes = !isPrimary && data.keywords.some((kw) => {
    const locales = analysis.crossLocaleDuplicates.get(kw);
    return locales && locales.length > 1;
  });
  return data.overlapsWithMetadata.length > 0 || hasDupes || data.charsFree > 15;
}

export function FixAllDialog({
  open,
  onOpenChange,
  analysis,
  appName,
  appTitle,
  appSubtitle,
  primaryLocale,
  description,
  onApply,
}: FixAllDialogProps) {
  // Sort: primary locale first (treated as master), then others
  const fixableLocales = analysis.localeData
    .filter((ld) => localeHasIssues(ld, analysis, ld.resolvedLocale === primaryLocale))
    .sort((a, b) => {
      const aIsPrimary = a.resolvedLocale === primaryLocale ? 0 : 1;
      const bIsPrimary = b.resolvedLocale === primaryLocale ? 0 : 1;
      return aIsPrimary - bIsPrimary;
    });
  const [results, setResults] = useState<Record<string, LocaleResult>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [authError, setAuthError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    setAuthError(false);
    const initialChecked: Record<string, boolean> = {};
    for (const ld of fixableLocales) {
      initialChecked[ld.locale] = true;
    }
    setChecked(initialChecked);
    runFix();

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [open]);

  async function runFix() {
    const controller = new AbortController();
    abortRef.current = controller;

    const loading: Record<string, LocaleResult> = {};
    for (const ld of fixableLocales) {
      loading[ld.locale] = { status: "loading", value: "" };
    }
    setResults(loading);

    // Process sequentially so each locale's result feeds into the next forbidden list
    const newKeywordsByLocale: Record<string, string[]> = {};

    // Primary locale's keywords are the master list – non-primary locales strip these
    const primaryData = analysis.localeData.find((ld) => ld.resolvedLocale === primaryLocale);
    const primaryKeywords = new Set(primaryData?.keywords.map((kw) => kw.toLowerCase()) ?? []);
    // Track keywords claimed by already-processed locales to avoid cross-locale dupes
    const claimedKeywords = new Set<string>();

    for (const ld of fixableLocales) {
      if (controller.signal.aborted) break;

      const isPrimary = ld.resolvedLocale === primaryLocale;

      // Primary locale: keep ALL keywords intact, only fill budget
      // Other locales: remove name/subtitle overlaps + primary locale duplicates + already-claimed
      const cleaned = isPrimary
        ? ld.keywordsRaw
        : cleanKeywords(ld, primaryKeywords, claimedKeywords);

      const forbidden = buildForbiddenWords(
        ld.locale, analysis, appName, appSubtitle(ld.locale),
      );
      // Add keywords from already-fixed locales to the forbidden list
      for (const kws of Object.values(newKeywordsByLocale)) {
        for (const kw of kws) forbidden.push(kw);
      }

      // If primary locale has no room to fill, skip AI call
      if (isPrimary && ld.charsFree <= 5) {
        newKeywordsByLocale[ld.locale] = ld.keywords;
        for (const kw of ld.keywords) claimedKeywords.add(kw.toLowerCase());
        setResults((prev) => ({
          ...prev,
          [ld.locale]: { status: "done", value: ld.keywordsRaw },
        }));
        continue;
      }

      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "fix-keywords",
            text: cleaned,
            field: "keywords",
            locale: ld.locale,
            appName: appTitle(ld.locale) ?? appName,
            subtitle: appSubtitle(ld.locale),
            charLimit: FIELD_LIMITS.keywords,
            description: description(ld.locale),
            forbiddenWords: [...new Set(forbidden)],
          }),
          signal: controller.signal,
        });
        const data = await res.json();

        if (data.error === "ai_auth_error") {
          controller.abort();
          setAuthError(true);
          setResults((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(next)) {
              if (next[key].status === "loading") {
                next[key] = { status: "error", value: "" };
              }
            }
            return next;
          });
          return;
        }

        if (res.ok) {
          const resultKeywords = data.result
            .split(",").map((w: string) => w.trim().toLowerCase()).filter(Boolean);
          newKeywordsByLocale[ld.locale] = resultKeywords;
          for (const kw of resultKeywords) claimedKeywords.add(kw);
          setResults((prev) => ({
            ...prev,
            [ld.locale]: { status: "done", value: data.result },
          }));
        } else {
          setResults((prev) => ({
            ...prev,
            [ld.locale]: { status: "error", value: "" },
          }));
        }
      } catch {
        if (controller.signal.aborted) return;
        setResults((prev) => ({
          ...prev,
          [ld.locale]: { status: "error", value: "" },
        }));
      }
    }
  }

  function toggleLocale(locale: string) {
    setChecked((prev) => ({ ...prev, [locale]: !prev[locale] }));
  }

  function toggleAll() {
    const allChecked = fixableLocales.every((ld) => checked[ld.locale]);
    const next: Record<string, boolean> = {};
    for (const ld of fixableLocales) {
      next[ld.locale] = !allChecked;
    }
    setChecked(next);
  }

  function handleApply() {
    const updates: Record<string, string> = {};
    for (const ld of fixableLocales) {
      if (!checked[ld.locale]) continue;
      const fr = results[ld.locale];
      if (fr?.status === "done") {
        updates[ld.resolvedLocale] = fr.value;
      }
    }
    if (Object.keys(updates).length > 0) {
      onApply(updates);
    }
    onOpenChange(false);
  }

  const checkedCount = fixableLocales.filter((ld) => checked[ld.locale]).length;
  const allChecked = checkedCount === fixableLocales.length;
  const allFinished = fixableLocales.every((ld) => {
    const s = results[ld.locale]?.status;
    return s === "done" || s === "error";
  });
  const anyApplicable = fixableLocales.some(
    (ld) => checked[ld.locale] && results[ld.locale]?.status === "done",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] !grid grid-rows-[auto_1fr_auto] gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>Improve all keywords with AI</DialogTitle>
        </DialogHeader>

        {authError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 mb-3 text-sm text-destructive">
            Your API key is invalid or revoked.{" "}
            <a href="/settings/ai" className="underline font-medium">
              Update it in AI settings
            </a>.
          </div>
        )}

        <ScrollArea className="min-h-0 overflow-hidden">
          <div className="space-y-1 pr-3">
            {fixableLocales.map((ld) => {
              const fr = results[ld.locale];
              const isLoading = fr?.status === "loading";
              const isError = fr?.status === "error";
              const after = fr?.status === "done" ? fr.value : "";

              return (
                <div key={ld.locale} className="rounded-md px-2 py-1.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={checked[ld.locale] ?? false}
                      onCheckedChange={() => toggleLocale(ld.locale)}
                      disabled={isLoading || isError}
                    />
                    <span className="text-sm font-medium">{localeName(ld.locale)}</span>
                    <span className="text-xs text-muted-foreground">{ld.locale}</span>
                    <span className="ml-auto flex items-center gap-2">
                      {!isLoading && !isError && after && (
                        <CharCount value={after} limit={FIELD_LIMITS.keywords} />
                      )}
                      {isLoading && (
                        <CircleNotch size={14} className="animate-spin text-muted-foreground" />
                      )}
                      {isError && (
                        <Warning size={14} className="text-destructive" />
                      )}
                      {fr?.status === "done" && (
                        <Check size={14} className="text-green-600" />
                      )}
                    </span>
                  </div>
                  {isLoading ? (
                    <div className="ml-8 flex h-8 items-center justify-center rounded border bg-muted/40">
                      <CircleNotch size={12} className="animate-spin text-muted-foreground" />
                    </div>
                  ) : isError ? (
                    <div className="ml-8 flex h-8 items-center justify-center rounded border border-destructive/30 bg-muted/40 text-xs text-destructive">
                      Failed
                    </div>
                  ) : fr?.status === "done" ? (
                    <div className="ml-8">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0">
                        <p className="text-[11px] font-medium text-muted-foreground mb-1">Before</p>
                        <p className="text-[11px] font-medium text-muted-foreground mb-1">After</p>
                        <div className="max-h-20 overflow-y-auto rounded border bg-muted/40 px-2 py-1.5 text-xs whitespace-pre-wrap">
                          {ld.keywordsRaw || (
                            <span className="italic text-muted-foreground">Empty</span>
                          )}
                        </div>
                        <div className="max-h-20 overflow-y-auto rounded border bg-muted/40 px-2 py-1.5 text-xs whitespace-pre-wrap">
                          {after || (
                            <span className="italic text-muted-foreground">Empty</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex shrink-0 items-center justify-between pt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={allChecked}
              onCheckedChange={toggleAll}
            />
            <span className="text-sm text-muted-foreground">Select all</span>
          </label>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!anyApplicable} onClick={handleApply}>
              {allFinished
                ? `Apply ${checkedCount} locale${checkedCount !== 1 ? "s" : ""}`
                : "Fixing\u2026"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
