"use client";

import { useState, useEffect } from "react";
import { CaretRight, Check, Warning, CircleNotch, ArrowClockwise } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { localeName } from "@/lib/asc/locale-names";
import { CharCount } from "@/components/char-count";
import { GuidanceField } from "@/components/guidance-field";
import { useBulkAI, resultKey } from "@/lib/hooks/use-bulk-ai";
import type { BulkField } from "@/lib/hooks/use-bulk-ai";
import { useAiGuidance } from "@/lib/hooks/use-ai-guidance";

interface BulkAllAIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "translate" | "copy";
  primaryLocale: string;
  locales: string[];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  localeData: Record<string, Record<string, any>>;
  fields: BulkField[];
  appName?: string;
  onApply: (updates: Record<string, Record<string, string>>) => void;
}

function localeStatus(
  locale: string,
  fields: BulkField[],
  results: Record<string, import("@/lib/hooks/use-bulk-ai").FieldResult>,
): "pending" | "loading" | "done" | "error" | "partial" {
  const statuses = fields.map((f) => results[resultKey(locale, f.key)]?.status ?? "pending");
  if (statuses.every((s) => s === "done")) return "done";
  if (statuses.some((s) => s === "error") && statuses.every((s) => s === "done" || s === "error"))
    return "partial";
  if (statuses.some((s) => s === "loading")) return "loading";
  if (statuses.some((s) => s === "error")) return "error";
  return "pending";
}

export function BulkAllAIDialog({
  open,
  onOpenChange,
  mode,
  primaryLocale,
  locales,
  localeData,
  fields,
  appName,
  onApply,
}: BulkAllAIDialogProps) {
  const targetLocales = locales.filter((l) => l !== primaryLocale);
  const singleField = fields.length === 1;

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Configure step: translation/copy only starts once the user confirms.
  const [started, setStarted] = useState(false);
  const [runLocales, setRunLocales] = useState<string[]>([]);

  // Reset configure state every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const initial: Record<string, boolean> = {};
    for (const loc of targetLocales) {
      initial[loc] = true;
    }
    setChecked(initial);
    setExpanded({});
    setStarted(false);
    setRunLocales([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init only on open transition
  }, [open]);

  const { guidance, setGuidance, saveGuidance } = useAiGuidance("translation");

  const { results, authError, getResult, retryField, retryLocale } = useBulkAI({
    open: open && started,
    mode,
    primaryLocale,
    targetLocales: runLocales,
    localeData,
    fields,
    appName,
    guidance,
  });

  function handleStart() {
    const selected = targetLocales.filter((l) => checked[l]);
    if (selected.length === 0) return;
    setRunLocales(selected);
    setStarted(true);
  }

  // --- Checkbox logic ---

  function toggleLocale(locale: string) {
    setChecked((prev) => ({ ...prev, [locale]: !prev[locale] }));
  }

  function toggleAll() {
    const allChk = targetLocales.every((l) => checked[l]);
    const next: Record<string, boolean> = {};
    for (const loc of targetLocales) {
      next[loc] = !allChk;
    }
    setChecked(next);
  }

  function toggleExpand(locale: string) {
    setExpanded((prev) => ({ ...prev, [locale]: !prev[locale] }));
  }

  // --- Apply ---

  function handleApply() {
    const updates: Record<string, Record<string, string>> = {};
    for (const loc of runLocales) {
      if (!checked[loc]) continue;
      const fieldUpdates: Record<string, string> = {};
      for (const f of fields) {
        const fr = getResult(loc, f.key);
        if (fr?.status === "done") {
          fieldUpdates[f.key] = fr.value;
        }
      }
      if (Object.keys(fieldUpdates).length > 0) {
        updates[loc] = fieldUpdates;
      }
    }
    if (Object.keys(updates).length > 0) {
      onApply(updates);
    }
    onOpenChange(false);
  }

  // --- Derived state ---

  // Configure step
  const configCheckedCount = targetLocales.filter((l) => checked[l]).length;
  const configAllChecked = configCheckedCount === targetLocales.length;

  // Run step
  const runCheckedCount = runLocales.filter((l) => checked[l]).length;
  const allFinished = runLocales.every((loc) => {
    const s = localeStatus(loc, fields, results);
    return s === "done" || s === "error" || s === "partial";
  });

  const anyApplicable = runLocales.some((loc) => {
    if (!checked[loc]) return false;
    return fields.some((f) => getResult(loc, f.key)?.status === "done");
  });

  const baseLabel = localeName(primaryLocale);
  const title =
    mode === "translate"
      ? `Translate from ${baseLabel} to all languages`
      : `Copy from ${baseLabel} to all languages`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] !grid grid-rows-[auto_1fr_auto] gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {authError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 mb-3 text-sm text-destructive">
            Your API key is invalid or revoked.{" "}
            <a href="/settings/ai" className="underline font-medium">
              Update it in AI settings
            </a>.
          </div>
        )}

        {!started ? (
          <>
            <ScrollArea className="min-h-0 overflow-hidden">
              <div className="space-y-1 pr-3">
                <p className="mb-2 px-2 text-sm text-muted-foreground">
                  {mode === "translate"
                    ? `Choose which languages to translate ${baseLabel} into, then start.`
                    : `Choose which languages to copy ${baseLabel} into.`}
                </p>
                {targetLocales.map((loc) => (
                  <label
                    key={loc}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={checked[loc] ?? false}
                      onCheckedChange={() => toggleLocale(loc)}
                    />
                    <span className="text-sm font-medium">{localeName(loc)}</span>
                    <span className="text-xs text-muted-foreground">{loc}</span>
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
                <span className="text-sm text-muted-foreground">Select all</span>
              </label>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button disabled={configCheckedCount === 0} onClick={handleStart}>
                  {mode === "translate" ? "Translate" : "Copy"}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
        <ScrollArea className="min-h-0 overflow-hidden">
          <div className="space-y-1 pr-3">
            {runLocales.map((loc) => {
              const status = localeStatus(loc, fields, results);
              const isOpen = expanded[loc] ?? false;

              // For single-field mode, show result inline below locale name
              if (singleField) {
                const fr = getResult(loc, fields[0].key);
                const isLoading = fr?.status === "loading";
                const isError = fr?.status === "error";
                const after = fr?.status === "done" ? fr.value : "";

                return (
                  <div key={loc} className="rounded-md px-2 py-1.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={checked[loc] ?? false}
                        onCheckedChange={() => toggleLocale(loc)}
                      />
                      <span className="text-sm font-medium">{localeName(loc)}</span>
                      <span className="text-xs text-muted-foreground">{loc}</span>
                      <span className="ml-auto flex items-center gap-1">
                        {isLoading && (
                          <CircleNotch size={14} className="animate-spin text-muted-foreground" />
                        )}
                        {isError && (
                          <Warning size={14} className="text-destructive" />
                        )}
                        {fr?.status === "done" && fr.overLimit && (
                          <span className="inline-flex items-center gap-1 text-xs text-destructive">
                            <Warning size={12} />
                            Too long
                          </span>
                        )}
                        {mode === "translate" && (
                          <button
                            type="button"
                            onClick={() => retryLocale(loc)}
                            disabled={isLoading}
                            title="Re-translate this language"
                            className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ArrowClockwise size={12} />
                          </button>
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
                        <div className="max-h-24 overflow-y-auto rounded border bg-muted/40 px-2 py-1.5 text-xs whitespace-pre-wrap">
                          {after || (
                            <span className="italic text-muted-foreground">Empty</span>
                          )}
                        </div>
                        {after && <CharCount value={after} limit={fields[0].charLimit} />}
                      </div>
                    ) : null}
                  </div>
                );
              }

              // Multi-field mode: collapsible rows
              return (
                <Collapsible
                  key={loc}
                  open={isOpen}
                  onOpenChange={() => toggleExpand(loc)}
                >
                  <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                    <Checkbox
                      checked={checked[loc] ?? false}
                      onCheckedChange={() => toggleLocale(loc)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-sm">
                      <CaretRight
                        size={12}
                        className={`text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                      <span className="font-medium">{localeName(loc)}</span>
                      <span className="text-muted-foreground text-xs">{loc}</span>
                    </CollapsibleTrigger>
                    <div className="flex items-center gap-1">
                      {status === "loading" && (
                        <CircleNotch size={14} className="animate-spin text-muted-foreground" />
                      )}
                      {status === "done" && (
                        <Check size={14} className="text-green-600" />
                      )}
                      {(status === "error" || status === "partial") && (
                        <Warning size={14} className="text-destructive" />
                      )}
                      {mode === "translate" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            retryLocale(loc);
                          }}
                          disabled={status === "loading"}
                          title="Re-translate this language"
                          className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ArrowClockwise size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  <CollapsibleContent>
                    <div className="space-y-3 py-2 pl-10 pr-2">
                      {fields.map((field) => {
                        const fr = getResult(loc, field.key);
                        const after = fr?.status === "done" ? fr.value : "";
                        const isLoading = fr?.status === "loading";
                        const isError = fr?.status === "error";

                        return (
                          <div key={field.key} className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">{field.label}</span>
                              {isLoading && (
                                <CircleNotch
                                  size={10}
                                  className="animate-spin text-muted-foreground"
                                />
                              )}
                              {isError && (
                                <span className="text-xs text-destructive">Failed</span>
                              )}
                              {fr?.status === "done" && fr.overLimit && (
                                <span className="inline-flex items-center gap-1 text-xs text-destructive">
                                  <Warning size={10} />
                                  Too long
                                </span>
                              )}
                              {mode === "translate" && (
                                <button
                                  type="button"
                                  onClick={() => retryField(loc, field.key)}
                                  disabled={isLoading}
                                  title="Re-translate this field"
                                  className="ml-auto inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <ArrowClockwise size={10} />
                                </button>
                              )}
                            </div>
                            {isLoading ? (
                              <div className="flex h-8 items-center justify-center rounded border bg-muted/40">
                                <CircleNotch
                                  size={12}
                                  className="animate-spin text-muted-foreground"
                                />
                              </div>
                            ) : isError ? (
                              <div className="flex h-8 items-center justify-center rounded border border-destructive/30 bg-muted/40 text-xs text-destructive">
                                Failed
                              </div>
                            ) : (
                              <div>
                                <div className="max-h-24 overflow-y-auto rounded border bg-muted/40 px-2 py-1.5 text-xs whitespace-pre-wrap">
                                  {after || (
                                    <span className="italic text-muted-foreground">Empty</span>
                                  )}
                                </div>
                                {after && <CharCount value={after} limit={field.charLimit} />}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex shrink-0 items-center justify-between pt-4">
          <span className="text-sm text-muted-foreground">
            {runCheckedCount} of {runLocales.length} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!anyApplicable} onClick={handleApply}>
              {allFinished || mode === "copy"
                ? `Apply ${runCheckedCount} language${runCheckedCount !== 1 ? "s" : ""}`
                : "Translating\u2026"}
            </Button>
          </div>
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
