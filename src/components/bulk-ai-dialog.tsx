"use client";

import { useState, useEffect } from "react";
import { Check, Warning, CircleNotch, ArrowClockwise } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { localeName } from "@/lib/asc/locale-names";
import { CharCount } from "@/components/char-count";
import { GuidanceField } from "@/components/guidance-field";
import { useBulkAI } from "@/lib/hooks/use-bulk-ai";
import { useAiGuidance } from "@/lib/hooks/use-ai-guidance";
import { useTranslations } from "@/lib/i18n/locale-context";

// Re-export for backwards compatibility
export type { BulkField } from "@/lib/hooks/use-bulk-ai";

interface BulkAIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "translate" | "copy";
  targetLocale: string;
  primaryLocale: string;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  localeData: Record<string, Record<string, any>>;
  fields: import("@/lib/hooks/use-bulk-ai").BulkField[];
  appName?: string;
  onApply: (updates: Record<string, Record<string, string>>) => void;
}

/**
 * Merge bulk updates into locale data. Extracted for testability.
 */
export function mergeBulkUpdates(
  current: Record<string, Record<string, string>>,
  updates: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const next = { ...current };
  for (const [locale, fields] of Object.entries(updates)) {
    next[locale] = { ...next[locale], ...fields };
  }
  return next;
}

export function BulkAIDialog({
  open,
  onOpenChange,
  mode,
  targetLocale,
  primaryLocale,
  localeData,
  fields,
  appName,
  onApply,
}: BulkAIDialogProps) {
  const t = useTranslations();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  // Configure step: translation/copy only starts once the user confirms.
  const [started, setStarted] = useState(false);
  const [runFields, setRunFields] = useState<import("@/lib/hooks/use-bulk-ai").BulkField[]>([]);

  // Reset configure state every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const initial: Record<string, boolean> = {};
    for (const f of fields) {
      initial[f.key] = true;
    }
    setChecked(initial);
    setStarted(false);
    setRunFields([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init only on open transition
  }, [open]);

  const { guidance, setGuidance, saveGuidance } = useAiGuidance("translation");

  const { authError, getResult, retryField } = useBulkAI({
    open: open && started,
    mode,
    primaryLocale,
    targetLocales: [targetLocale],
    localeData,
    fields: runFields,
    appName,
    guidance,
  });

  function handleStart() {
    const selected = fields.filter((f) => checked[f.key]);
    if (selected.length === 0) return;
    setRunFields(selected);
    setStarted(true);
  }

  // --- Checkbox logic ---

  function toggleField(fieldKey: string) {
    setChecked((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  }

  function toggleAll() {
    const allChk = fields.every((f) => checked[f.key]);
    const next: Record<string, boolean> = {};
    for (const f of fields) {
      next[f.key] = !allChk;
    }
    setChecked(next);
  }

  // --- Apply ---

  function handleApply() {
    const fieldUpdates: Record<string, string> = {};
    for (const f of runFields) {
      if (!checked[f.key]) continue;
      const fr = getResult(targetLocale, f.key);
      if (fr?.status === "done") {
        fieldUpdates[f.key] = fr.value;
      }
    }
    if (Object.keys(fieldUpdates).length > 0) {
      onApply({ [targetLocale]: fieldUpdates });
    }
    onOpenChange(false);
  }

  // --- Derived state ---

  // Configure step
  const configCheckedCount = fields.filter((f) => checked[f.key]).length;
  const configAllChecked = configCheckedCount === fields.length;

  // Run step
  const runCheckedCount = runFields.filter((f) => checked[f.key]).length;
  const allFinished = runFields.every((f) => {
    const s = getResult(targetLocale, f.key)?.status;
    return s === "done" || s === "error";
  });

  const anyApplicable = runFields.some(
    (f) => checked[f.key] && getResult(targetLocale, f.key)?.status === "done",
  );

  const targetLabel = localeName(targetLocale);
  const baseLabel = localeName(primaryLocale);
  const title =
    mode === "translate"
      ? t("bulkAi.translateAllTo", { locale: targetLabel })
      : t("bulkAi.copyAllFrom", { locale: baseLabel });

  const currentFields = localeData[targetLocale] ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] !grid grid-rows-[auto_1fr_auto] gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {authError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 mb-3 text-sm text-destructive">
            {t("bulkAi.authError")}{" "}
            <a href="/settings/ai" className="underline font-medium">
              {t("bulkAi.updateAiSettings")}
            </a>.
          </div>
        )}

        {!started ? (
          <>
            <ScrollArea className="min-h-0 overflow-hidden">
              <div className="space-y-1 pr-3">
                <p className="mb-2 text-sm text-muted-foreground">
                  {mode === "translate"
                    ? t("bulkAi.chooseTranslateTo", { locale: targetLabel })
                    : t("bulkAi.chooseCopyFrom", { locale: baseLabel })}
                </p>
                {fields.map((field) => (
                  <label
                    key={field.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={checked[field.key] ?? false}
                      onCheckedChange={() => toggleField(field.key)}
                    />
                    <span className="text-sm">{field.label}</span>
                  </label>
                ))}
                {mode === "translate" && (
                  <div className="px-2 pt-2">
                    <GuidanceField
                      value={guidance}
                      onChange={setGuidance}
                      onBlur={saveGuidance}
                    />
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="flex shrink-0 items-center justify-between pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={configAllChecked} onCheckedChange={toggleAll} />
                <span className="text-sm text-muted-foreground">{t("keywords.selectAll")}</span>
              </label>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  {t("common.cancel")}
                </Button>
                <Button disabled={configCheckedCount === 0} onClick={handleStart}>
                  {mode === "translate" ? t("bulkAi.translate") : t("bulkAi.copy")}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
        <ScrollArea className="min-h-0 overflow-hidden">
          <div className="space-y-4 pr-3">
            {runFields.map((field) => {
              const fr = getResult(targetLocale, field.key);
              const before = String(currentFields[field.key] ?? "");
              const after = fr?.status === "done" ? fr.value : "";
              const isLoading = fr?.status === "loading";
              const isError = fr?.status === "error";
              const unchanged = fr?.status === "done" && before === after;
              const overLimit = fr?.status === "done" && fr.overLimit === true;

              return (
                <div key={field.key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={checked[field.key] ?? false}
                      onCheckedChange={() => toggleField(field.key)}
                      disabled={isLoading || isError}
                    />
                    <span className="text-sm font-medium">{field.label}</span>
                    {isLoading && (
                      <CircleNotch
                        size={12}
                        className="animate-spin text-muted-foreground"
                      />
                    )}
                    {isError && (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive">
                        <Warning size={12} />
                        {t("keywords.failed")}
                      </span>
                    )}
                    {overLimit && (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive">
                        <Warning size={12} />
                        {t("bulkAi.tooLong")}
                      </span>
                    )}
                    {unchanged && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Check size={12} />
                        {t("bulkAi.noChange")}
                      </span>
                    )}
                    {mode === "translate" && (
                      <button
                        type="button"
                        onClick={() => retryField(targetLocale, field.key)}
                        disabled={isLoading}
                        title={t("bulkAi.retranslateField")}
                        className="ml-auto inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ArrowClockwise size={12} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0 pl-6">
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">
                      {t("keywords.before")}
                    </p>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">
                      {t("keywords.after")}
                    </p>
                    {/* Both cells share the same grid row so they match height */}
                    <div className="max-h-32 overflow-y-auto rounded border bg-muted/40 px-2.5 py-2 text-xs whitespace-pre-wrap">
                      {before || (
                        <span className="italic text-muted-foreground">
                          {t("reviewChanges.empty")}
                        </span>
                      )}
                    </div>
                    {isLoading ? (
                      <div className="flex items-center justify-center rounded border bg-muted/40">
                        <CircleNotch
                          size={14}
                          className="animate-spin text-muted-foreground"
                        />
                      </div>
                    ) : isError ? (
                      <div className="flex items-center justify-center rounded border border-destructive/30 bg-muted/40 text-xs text-destructive">
                        {t("bulkAi.translationFailed")}
                      </div>
                    ) : (
                      <div className="max-h-32 overflow-y-auto rounded border bg-muted/40 px-2.5 py-2 text-xs whitespace-pre-wrap">
                        {after || (
                          <span className="italic text-muted-foreground">
                            {t("reviewChanges.empty")}
                          </span>
                        )}
                      </div>
                    )}
                    {field.charLimit && (
                      <>
                        <CharCount value={before} limit={field.charLimit} />
                        {!isLoading && !isError && after
                          ? <CharCount value={after} limit={field.charLimit} />
                          : <span />}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex shrink-0 items-center justify-between pt-4">
          <span className="text-sm text-muted-foreground">
            {t("bulkAi.selectedOf", { selected: runCheckedCount, total: runFields.length })}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!anyApplicable} onClick={handleApply}>
              {allFinished || mode === "copy"
                ? runCheckedCount === 1
                  ? t("bulkAi.applyFields", { count: runCheckedCount })
                  : t("bulkAi.applyFieldsPlural", { count: runCheckedCount })
                : t("bulkAi.translating")}
            </Button>
          </div>
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
