"use client";

import { useState, useMemo } from "react";
import { MagicWand } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useAIStatus } from "@/lib/hooks/use-ai-status";
import { localeName } from "@/lib/asc/locale-names";
import { AIRequiredDialog } from "./ai-required-dialog";
import { AICompareDialog } from "./ai-compare-dialog";

interface MagicWandButtonProps {
  value: string;
  onChange: (newValue: string) => void;
  field: string;
  locale: string;
  baseLocale: string;
  baseValue: string;
  appName?: string;
  charLimit?: number;
  disabled?: boolean;
  /** For keywords: description in the current locale (generation context). */
  description?: string;
  /** For keywords: all other locales' keywords for gap analysis. */
  otherLocaleKeywords?: Record<string, string>;
}

/** Shared locale props for all MagicWandButtons on a page. */
export interface MagicWandLocaleProps {
  locale: string;
  baseLocale: string;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  localeData: Record<string, any>;
  appName?: string;
}

/**
 * Build per-field MagicWandButton props from shared locale context.
 * Eliminates repeating locale/baseLocale/baseValue/appName at every call site.
 * For the keywords field, also includes description and other locales' keywords.
 */
export function wandProps(
  shared: MagicWandLocaleProps,
  field: string,
): Pick<MagicWandButtonProps, "field" | "locale" | "baseLocale" | "baseValue" | "appName" | "description" | "otherLocaleKeywords"> {
  const base: Pick<MagicWandButtonProps, "field" | "locale" | "baseLocale" | "baseValue" | "appName"> = {
    field,
    locale: shared.locale,
    baseLocale: shared.baseLocale,
    baseValue: shared.localeData[shared.baseLocale]?.[field] ?? "",
    appName: shared.appName,
  };

  if (field !== "keywords") return base;

  // For keywords: provide description context and other locales' keywords
  const description = shared.localeData[shared.locale]?.description ?? "";
  const otherLocaleKeywords: Record<string, string> = {};
  for (const [loc, data] of Object.entries(shared.localeData)) {
    if (loc !== shared.locale && data?.keywords) {
      otherLocaleKeywords[loc] = data.keywords as string;
    }
  }

  return { ...base, description, otherLocaleKeywords };
}

interface CompareState {
  title: string;
  proposedValue?: string;
  apiBody?: Record<string, unknown>;
  singleLine?: boolean;
}

export function MagicWandButton({
  value,
  onChange,
  field,
  locale,
  baseLocale,
  baseValue,
  appName,
  charLimit,
  disabled,
  description,
  otherLocaleKeywords,
}: MagicWandButtonProps) {
  const { configured } = useAIStatus();
  const [showRequired, setShowRequired] = useState(false);
  const [compare, setCompare] = useState<CompareState | null>(null);
  const [translating, setTranslating] = useState(false);

  const isBaseLocale = locale === baseLocale;
  const isKeywords = field === "keywords";
  const isSingleLine = field === "keywords" || field === "name" || field === "subtitle";
  const hasValue = value.trim().length > 0;
  const hasBaseValue = baseValue.trim().length > 0;
  function requireAI(): boolean {
    if (!configured) {
      setShowRequired(true);
      return false;
    }
    return true;
  }

  function openCompare(state: CompareState) {
    setCompare({ ...state, singleLine: isSingleLine });
  }

  // --- Text field actions ---

  function handleTranslate() {
    if (!requireAI()) return;
    setTranslating(true);
    fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "translate",
        text: baseValue,
        field,
        fromLocale: baseLocale,
        toLocale: locale,
        appName,
        charLimit,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          onChange(data.result);
        }
      })
      .catch(() => {})
      .finally(() => setTranslating(false));
  }

  function handleCopy() {
    onChange(baseValue);
  }

  function handleImprove() {
    if (!requireAI()) return;
    openCompare({
      title: "Improve text",
      apiBody: {
        action: "improve",
        text: value,
        field,
        locale,
        appName,
        charLimit,
      },
    });
  }

  // --- Keyword-specific actions ---

  function handleGenerateKeywords() {
    if (!requireAI()) return;
    openCompare({
      title: "Generate keywords",
      apiBody: {
        action: "generate-keywords",
        text: value,
        field,
        locale,
        appName,
        charLimit,
        description,
      },
    });
  }

  function handleOptimizeKeywords() {
    if (!requireAI()) return;
    openCompare({
      title: "Optimize keywords",
      apiBody: {
        action: "optimize-keywords",
        text: value,
        field,
        locale,
        appName,
        charLimit,
        description,
      },
    });
  }

  function handleFillKeywordGaps() {
    if (!requireAI()) return;
    openCompare({
      title: "Fill gaps from other locales",
      apiBody: {
        action: "fill-keyword-gaps",
        text: value,
        field,
        locale,
        appName,
        charLimit,
        otherLocaleKeywords,
      },
    });
  }

  // Determine which menu items to show
  const hasKeywordActions = isKeywords;
  const hasTranslateActions = !isBaseLocale && !isKeywords;
  const hasImproveAction = isBaseLocale && !isKeywords;
  const hasAnyAction = hasKeywordActions || hasTranslateActions || hasImproveAction;

  // Memoize apiBody to avoid re-triggering the dialog's useEffect
  const compareApiBody = useMemo(() => compare?.apiBody, [compare]);

  if (!hasAnyAction) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            disabled={disabled || translating}
          >
            {translating ? <Spinner className="size-3.5" /> : <MagicWand size={14} />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {hasKeywordActions && (
            <>
              <DropdownMenuItem onSelect={handleGenerateKeywords}>
                Generate for locale
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={handleOptimizeKeywords}
                disabled={!hasValue}
              >
                Optimize
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={handleFillKeywordGaps}
                disabled={!otherLocaleKeywords || Object.keys(otherLocaleKeywords).length === 0}
              >
                Fill gaps from other locales
              </DropdownMenuItem>
            </>
          )}
          {hasTranslateActions && (
            <>
              <DropdownMenuItem onSelect={handleTranslate} disabled={!hasBaseValue}>
                Translate from {localeName(baseLocale)}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleCopy} disabled={!hasBaseValue}>
                Copy from {localeName(baseLocale)}
              </DropdownMenuItem>
            </>
          )}
          {hasImproveAction && (
            <DropdownMenuItem onSelect={handleImprove} disabled={!hasValue}>
              Improve…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AIRequiredDialog open={showRequired} onOpenChange={setShowRequired} />
      <AICompareDialog
        open={!!compare}
        onOpenChange={(open) => { if (!open) setCompare(null); }}
        title={compare?.title ?? ""}
        currentValue={value}
        proposedValue={compare?.proposedValue}
        apiBody={compareApiBody}
        singleLine={compare?.singleLine}
        onApply={onChange}
      />
    </>
  );
}
