"use client";

import { useState, useMemo } from "react";
import { CaretDown, Translate } from "@phosphor-icons/react";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useScreenshotSets } from "@/lib/hooks/use-screenshot-sets";
import { localeName } from "@/lib/asc/locale-names";
import {
  screenshotImageUrl,
  displayTypeLabel,
  sortDisplayTypes,
  type AscScreenshotSet,
} from "@/lib/asc/display-types";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  TranslateScreenshotsModal,
  type ScreenshotItem,
} from "@/components/translate-screenshots-modal";
import { useTranslations } from "@/lib/i18n/locale-context";

// ---------------------------------------------------------------------------
// Base locale screenshots (collapsible reference section)
// ---------------------------------------------------------------------------

export function BaseLocaleScreenshots({
  appId,
  versionId,
  primaryLocale,
  primaryLocalizationId,
  targetLocale,
  targetLocalizationId,
  targetSets,
  onCopied,
}: {
  appId: string;
  versionId: string;
  primaryLocale: string;
  primaryLocalizationId: string;
  targetLocale: string;
  targetLocalizationId: string;
  targetSets: AscScreenshotSet[];
  onCopied: () => Promise<void>;
}) {
  const t = useTranslations();
  const { screenshotSets, loading } = useScreenshotSets(appId, versionId, primaryLocalizationId);

  const sortedSets = useMemo(() => {
    const sorted = sortDisplayTypes(
      screenshotSets.map((s) => s.attributes.screenshotDisplayType),
    );
    return sorted.map(
      (dt) => screenshotSets.find((s) => s.attributes.screenshotDisplayType === dt)!,
    );
  }, [screenshotSets]);

  // Only show sets that have screenshots
  const setsWithScreenshots = useMemo(
    () => sortedSets.filter((s) => s.screenshots.length > 0),
    [sortedSets],
  );

  // Display type dropdown -- available types from base locale
  const availableTypes = useMemo(
    () => setsWithScreenshots.map((s) => s.attributes.screenshotDisplayType),
    [setsWithScreenshots],
  );

  const [selectedTypeRaw, setSelectedType] = useState<string>("");

  // Auto-select first available type (derived, no effect needed)
  const selectedType = availableTypes.length > 0 && (!selectedTypeRaw || !availableTypes.includes(selectedTypeRaw))
    ? availableTypes[0]
    : selectedTypeRaw;

  const selectedSet = setsWithScreenshots.find(
    (s) => s.attributes.screenshotDisplayType === selectedType,
  );

  // Expanded by default if target locale has no screenshots
  const targetHasScreenshots = targetSets.some((s) => s.screenshots.length > 0);
  const [open, setOpen] = useState(!targetHasScreenshots);

  // Selection state -- set of screenshot IDs, tracked with the display type
  const [selectionState, setSelectionState] = useState<{ ids: Set<string>; forType: string }>({ ids: new Set(), forType: "" });
  const selectedIds = selectionState.forType === selectedType ? selectionState.ids : new Set<string>();
  function setSelectedIds(idsOrUpdater: Set<string> | ((prev: Set<string>) => Set<string>)) {
    setSelectionState((prev) => {
      const prevIds = prev.forType === selectedType ? prev.ids : new Set<string>();
      const next = typeof idsOrUpdater === "function" ? idsOrUpdater(prevIds) : idsOrUpdater;
      return { ids: next, forType: selectedType };
    });
  }

  // All selectable screenshots in current set
  const selectableScreenshots = useMemo(() => {
    if (!selectedSet) return [];
    return selectedSet.screenshots.filter(
      (ss) => ss.attributes.assetDeliveryState?.state === "COMPLETE" && !!ss.attributes.assetToken,
    );
  }, [selectedSet]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Translate modal state
  const [translateItems, setTranslateItems] = useState<ScreenshotItem[]>([]);
  const [translateOpen, setTranslateOpen] = useState(false);

  function openTranslateModal(items: ScreenshotItem[]) {
    setTranslateItems(items);
    setTranslateOpen(true);
  }

  function handleTranslateSelected() {
    if (selectedIds.size === 0) return;
    const items: ScreenshotItem[] = [];
    for (const ss of selectableScreenshots) {
      if (selectedIds.has(ss.id)) {
        items.push({ screenshot: ss, displayType: selectedType });
      }
    }
    openTranslateModal(items);
  }

  function handleTranslateAll() {
    if (!selectedSet) return;
    const items: ScreenshotItem[] = [];
    for (const ss of selectedSet.screenshots) {
      if (ss.attributes.assetDeliveryState?.state === "COMPLETE" && ss.attributes.assetToken) {
        items.push({ screenshot: ss, displayType: selectedType });
      }
    }
    openTranslateModal(items);
  }

  async function handleTranslateComplete() {
    setSelectedIds(new Set());
    await onCopied();
  }

  if (loading || setsWithScreenshots.length === 0) return null;

  const hasSelection = selectedIds.size > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border bg-muted/20">
        <div className="flex items-center gap-3 px-4 py-3">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-3 text-sm font-medium hover:text-foreground/80"
            >
              <CaretDown
                size={14}
                className={cn(
                  "text-muted-foreground transition-transform",
                  !open && "-rotate-90",
                )}
              />
              <span>{t("screenshots.baseLocaleTitle", { locale: localeName(primaryLocale) })}</span>
            </button>
          </CollapsibleTrigger>

          <div className="ml-auto flex items-center gap-2">
            {availableTypes.length > 1 && (
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="rounded border bg-background px-2 py-1 text-xs text-muted-foreground"
              >
                {availableTypes.map((dt) => (
                  <option key={dt} value={dt}>
                    {displayTypeLabel(dt)}
                  </option>
                ))}
              </select>
            )}
            {hasSelection ? (
              <Button
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleTranslateSelected}
              >
                <Translate size={12} />
                {t("screenshots.translateSelected", { count: selectedIds.size })}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleTranslateAll}
              >
                <Translate size={12} />
                {t("screenshots.translateAll")}
              </Button>
            )}
          </div>
        </div>

        <CollapsibleContent>

          {selectedSet && (
            <div className="flex gap-3 overflow-x-auto px-4 pb-4">
              {selectedSet.screenshots.map((ss) => {
                const isComplete = ss.attributes.assetDeliveryState?.state === "COMPLETE";
                const hasToken = !!ss.attributes.assetToken;
                const isSelectable = isComplete && hasToken;
                const isSelected = selectedIds.has(ss.id);

                return (
                  <div key={ss.id} className="group/base relative shrink-0">
                    <div
                      className={cn(
                        "rounded-lg border p-2 cursor-pointer transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "bg-muted/30 opacity-60 hover:opacity-80",
                      )}
                      onClick={() => isSelectable && toggleSelect(ss.id)}
                    >
                      {isComplete && hasToken ? (
                        <img
                          src={screenshotImageUrl(ss.attributes.assetToken!, 300)}
                          alt={ss.attributes.fileName}
                          className="h-[160px] w-auto rounded object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-[160px] w-[90px] items-center justify-center rounded bg-muted">
                          <Spinner className="size-5 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>

                    {/* Checkbox */}
                    {isSelectable && (
                      <div
                        className="absolute top-1.5 left-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(ss.id)}
                          className="bg-background"
                        />
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleContent>
      </div>

      <TranslateScreenshotsModal
        open={translateOpen}
        onOpenChange={setTranslateOpen}
        items={translateItems}
        toLocale={targetLocale}
        targetLocalizationId={targetLocalizationId}
        onComplete={handleTranslateComplete}
      />
    </Collapsible>
  );
}
