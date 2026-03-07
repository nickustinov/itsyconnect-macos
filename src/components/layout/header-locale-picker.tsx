"use client";

import { useCallback, useState } from "react";
import { MagicWand } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { LocalePicker } from "@/components/locale-picker";
import { useHeaderLocale } from "@/lib/header-locale-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import { useAIStatus } from "@/lib/hooks/use-ai-status";
import { localeName } from "@/lib/asc/locale-names";
import { AIRequiredDialog } from "@/components/ai-required-dialog";

export function HeaderLocalePicker() {
  const configRef = useHeaderLocale();
  const config = configRef.current;
  const { guardNavigation } = useFormDirty();
  const { configured } = useAIStatus();
  const [showRequired, setShowRequired] = useState(false);

  // Stable wrappers that always read from the ref at call time
  const onLocaleChange = useCallback(
    (code: string) => guardNavigation(() => configRef.current?.onLocaleChange(code)),
    [configRef, guardNavigation],
  );
  const onLocaleAdd = useCallback(
    (code: string) => configRef.current?.onLocaleAdd(code),
    [configRef],
  );
  const onLocalesAdd = useCallback(
    (codes: string[]) => configRef.current?.onLocalesAdd?.(codes),
    [configRef],
  );
  const onLocaleDelete = useCallback(
    (code: string) => configRef.current?.onLocaleDelete?.(code),
    [configRef],
  );

  if (!config || config.locales.length === 0) return null;

  const hasSingleActions = !!(config.onBulkTranslate || config.onBulkCopy);
  const hasAllActions = !!(config.onBulkTranslateAll || config.onBulkCopyAll);
  const showWand = hasSingleActions || hasAllActions;
  const isBaseLocale = config.selectedLocale === config.primaryLocale;
  const baseLabel = localeName(config.primaryLocale);
  const targetLabel = localeName(config.selectedLocale);
  const multipleLocales = config.locales.length > 1;

  function requireAI(action: () => void) {
    if (!configured) {
      setShowRequired(true);
      return;
    }
    action();
  }

  return (
    <>
      <Separator orientation="vertical" className="mx-2 !h-4" />
      <LocalePicker
        locales={config.locales}
        selectedLocale={config.selectedLocale}
        primaryLocale={config.primaryLocale}
        onLocaleChange={onLocaleChange}
        onLocaleAdd={onLocaleAdd}
        onLocalesAdd={config.onLocalesAdd ? onLocalesAdd : undefined}
        onLocaleDelete={config.onLocaleDelete ? onLocaleDelete : undefined}
        section={config.section}
        otherSectionLocales={config.otherSectionLocales}
        availableLocales={config.availableLocales}
        readOnly={config.readOnly}
      />
      {showWand && multipleLocales && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                disabled={config.readOnly}
              >
                <MagicWand size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Single-locale items (only when non-base locale selected) */}
              {!isBaseLocale && config.onBulkTranslate && (
                <DropdownMenuItem
                  onSelect={() => requireAI(() => configRef.current?.onBulkTranslate?.())}
                >
                  Translate from {baseLabel} to {targetLabel}…
                </DropdownMenuItem>
              )}
              {!isBaseLocale && config.onBulkCopy && (
                <DropdownMenuItem
                  onSelect={() => configRef.current?.onBulkCopy?.()}
                >
                  Copy from {baseLabel} to {targetLabel}…
                </DropdownMenuItem>
              )}
              {/* Separator between single and all-locale items */}
              {!isBaseLocale && hasSingleActions && hasAllActions && (
                <DropdownMenuSeparator />
              )}
              {/* All-locale items */}
              {config.onBulkTranslateAll && (
                <DropdownMenuItem
                  onSelect={() => requireAI(() => configRef.current?.onBulkTranslateAll?.())}
                >
                  {isBaseLocale
                    ? "Translate to all languages…"
                    : `Translate from ${baseLabel} to all languages…`}
                </DropdownMenuItem>
              )}
              {config.onBulkCopyAll && (
                <DropdownMenuItem
                  onSelect={() => configRef.current?.onBulkCopyAll?.()}
                >
                  {isBaseLocale
                    ? "Copy to all languages…"
                    : `Copy from ${baseLabel} to all languages…`}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <AIRequiredDialog open={showRequired} onOpenChange={setShowRequired} />
        </>
      )}
    </>
  );
}
