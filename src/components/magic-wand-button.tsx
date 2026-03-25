"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { MagicWand } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useAIStatus } from "@/lib/hooks/use-ai-status";
import { localeName } from "@/lib/asc/locale-names";
import { buildForbiddenKeywords, splitMetaWords } from "@/lib/asc/keyword-utils";
import { PLATFORM_LABELS } from "@/lib/asc/version-types";
import { AIRequiredDialog } from "./ai-required-dialog";
import { AICompareDialog } from "./ai-compare-dialog";

export interface CopyFromVersion {
  versionId: string;
  versionString: string;
  platform: string;
}

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
  /** For keywords: app subtitle in the current locale. */
  subtitle?: string;
  /** For keywords: all other locales' keywords (for building forbidden list). */
  otherLocaleKeywords?: Record<string, string>;
  /** Callback to open the "translate to all languages" dialog for this field. */
  onTranslateAll?: () => void;
  /** Link to keywords insights page (for keywords field). */
  keywordsInsightsHref?: string;
  /** Other versions available to copy this field from. */
  copyFromVersions?: CopyFromVersion[];
  /** Callback when the user picks a version to copy from. */
  onCopyFromVersion?: (versionId: string) => void;
}

/** Shared locale props for all MagicWandButtons on a page. */
export interface MagicWandLocaleProps {
  locale: string;
  baseLocale: string;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  localeData: Record<string, any>;
  appName?: string;
  /** Per-locale app info (name/subtitle) for keyword context. */
  appInfoData?: Record<string, { name?: string | null; subtitle?: string | null }>;
  copyFromVersions?: CopyFromVersion[];
  onCopyFromVersion?: (field: string, versionId: string) => void;
}

/**
 * Build per-field MagicWandButton props from shared locale context.
 * Eliminates repeating locale/baseLocale/baseValue/appName at every call site.
 * For the keywords field, also includes description and other locales' keywords.
 */
export function wandProps(
  shared: MagicWandLocaleProps,
  field: string,
): Pick<MagicWandButtonProps, "field" | "locale" | "baseLocale" | "baseValue" | "appName" | "description" | "subtitle" | "otherLocaleKeywords" | "copyFromVersions" | "onCopyFromVersion"> {
  const base: Pick<MagicWandButtonProps, "field" | "locale" | "baseLocale" | "baseValue" | "appName" | "copyFromVersions" | "onCopyFromVersion"> = {
    field,
    locale: shared.locale,
    baseLocale: shared.baseLocale,
    baseValue: shared.localeData[shared.baseLocale]?.[field] ?? "",
    appName: shared.appName,
    copyFromVersions: shared.copyFromVersions,
    onCopyFromVersion: shared.onCopyFromVersion
      ? (versionId: string) => shared.onCopyFromVersion!(field, versionId)
      : undefined,
  };

  if (field !== "keywords") return base;

  const description = shared.localeData[shared.locale]?.description ?? "";
  const subtitle = shared.appInfoData?.[shared.locale]?.subtitle ?? undefined;
  const otherLocaleKeywords: Record<string, string> = {};
  for (const [loc, data] of Object.entries(shared.localeData)) {
    if (loc !== shared.locale && data?.keywords) {
      otherLocaleKeywords[loc] = data.keywords as string;
    }
  }

  return { ...base, description, subtitle, otherLocaleKeywords };
}

interface CompareState {
  title: string;
  proposedValue?: string;
  apiBody?: Record<string, unknown>;
  singleLine?: boolean;
  charLimit?: number;
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
  subtitle,
  otherLocaleKeywords,
  onTranslateAll,
  keywordsInsightsHref,
  copyFromVersions,
  onCopyFromVersion,
}: MagicWandButtonProps) {
  const { configured } = useAIStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showRequired, setShowRequired] = useState(false);
  const [compare, setCompare] = useState<CompareState | null>(null);
  const [translating, setTranslating] = useState(false);

  const isBaseLocale = locale === baseLocale;
  const isKeywords = field === "keywords";
  const isSingleLine = field === "keywords" || field === "name" || field === "subtitle";
  const hasValue = (value ?? "").trim().length > 0;
  const hasBaseValue = (baseValue ?? "").trim().length > 0;
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
      charLimit,
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

  function buildKeywordForbiddenWords(): string[] {
    return buildForbiddenKeywords({
      appName,
      subtitle,
      otherLocaleKeywords: otherLocaleKeywords ?? undefined,
    });
  }

  function handleFixKeywords() {
    if (!requireAI()) return;
    const forbiddenWords = buildKeywordForbiddenWords();

    // Pre-clean: strip name/subtitle overlaps and cross-locale duplicates
    const metaWords = new Set<string>([
      ...(appName ? splitMetaWords(appName) : []),
      ...(subtitle ? splitMetaWords(subtitle) : []),
    ]);
    const otherKws = new Set(
      Object.values(otherLocaleKeywords ?? {})
        .flatMap((raw) => raw.split(",").map((w) => w.trim().toLowerCase()))
        .filter(Boolean),
    );

    const cleaned = value
      .split(",")
      .map((k) => k.trim())
      .filter((k) => {
        const lower = k.toLowerCase();
        if (!lower) return false;
        if (lower.split(/\s+/).some((w) => metaWords.has(w))) return false;
        if (otherKws.has(lower)) return false;
        return true;
      })
      .join(",");

    openCompare({
      title: hasValue ? "Improve keywords" : "Generate keywords",
      charLimit,
      apiBody: {
        action: "fix-keywords",
        text: cleaned,
        field,
        locale,
        appName,
        subtitle,
        charLimit,
        description,
        forbiddenWords,
      },
    });
  }

  // Determine which menu items to show
  const hasKeywordActions = isKeywords;
  const hasTranslateActions = !isBaseLocale && !isKeywords;
  const hasImproveAction = isBaseLocale && !isKeywords;
  const hasTranslateAllAction = !!onTranslateAll && !isKeywords;
  const hasCopyFromVersionAction = (copyFromVersions?.length ?? 0) > 0 && !!onCopyFromVersion;
  const hasAnyAction = hasKeywordActions || hasTranslateActions || hasImproveAction || hasTranslateAllAction || hasCopyFromVersionAction;

  // Memoize apiBody to avoid re-triggering the dialog's useEffect
  const compareApiBody = useMemo(() => compare?.apiBody, [compare]);

  if (!hasAnyAction) return null;

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
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
              <DropdownMenuItem onSelect={handleFixKeywords}>
                {hasValue ? "Improve…" : "Generate…"}
              </DropdownMenuItem>
              {keywordsInsightsHref && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={keywordsInsightsHref}>Keywords insights</Link>
                  </DropdownMenuItem>
                </>
              )}
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
          {hasCopyFromVersionAction && (
            <>
              <DropdownMenuSeparator />
              <CopyFromVersionSubMenu
                versions={copyFromVersions!}
                onSelect={(versionId) => {
                  setMenuOpen(false);
                  onCopyFromVersion!(versionId);
                }}
              />
            </>
          )}
          {hasTranslateAllAction && (
            <>
              {!isBaseLocale && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onSelect={() => {
                  if (!requireAI()) return;
                  onTranslateAll!();
                }}
                disabled={!hasBaseValue}
              >
                {isBaseLocale
                  ? "Translate to all languages…"
                  : `Translate from ${localeName(baseLocale)} to all languages…`}
              </DropdownMenuItem>
            </>
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
        charLimit={compare?.charLimit}
        onApply={onChange}
      />
    </>
  );
}

function CopyFromVersionSubMenu({
  versions,
  onSelect,
}: {
  versions: CopyFromVersion[];
  onSelect: (versionId: string) => void;
}) {
  const platforms = [...new Set(versions.map((v) => v.platform))];
  const multiPlatform = platforms.length > 1;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Copy from version</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {multiPlatform
          ? platforms.map((platform) => (
              <DropdownMenuSub key={platform}>
                <DropdownMenuSubTrigger>
                  {PLATFORM_LABELS[platform] ?? platform}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {versions
                    .filter((v) => v.platform === platform)
                    .map((v) => (
                      <DropdownMenuItem
                        key={v.versionId}
                        onSelect={() => onSelect(v.versionId)}
                      >
                        {v.versionString}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))
          : versions.map((v) => (
              <DropdownMenuItem
                key={v.versionId}
                onSelect={() => onSelect(v.versionId)}
              >
                {v.versionString}
              </DropdownMenuItem>
            ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
