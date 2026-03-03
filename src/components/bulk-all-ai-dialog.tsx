"use client";

import { useState, useEffect, useRef } from "react";
import { CaretRight, Check, Warning, CircleNotch } from "@phosphor-icons/react";
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
import type { BulkField } from "./bulk-ai-dialog";

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

type FieldStatus = "pending" | "loading" | "done" | "error";

interface FieldResult {
  status: FieldStatus;
  value: string;
}

// Results keyed by `${locale}:${fieldKey}`
type AllResults = Record<string, FieldResult>;

function resultKey(locale: string, fieldKey: string) {
  return `${locale}:${fieldKey}`;
}

function localeStatus(
  locale: string,
  fields: BulkField[],
  results: AllResults,
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
  const [results, setResults] = useState<AllResults>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [authError, setAuthError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    // Init checked state – all locales checked
    setAuthError(false);
    const initialChecked: Record<string, boolean> = {};
    for (const loc of targetLocales) {
      initialChecked[loc] = true;
    }
    setChecked(initialChecked);
    setExpanded({});

    if (mode === "copy") {
      runCopy();
    } else {
      runTranslate();
    }

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [open]);

  function runCopy() {
    const baseFields = localeData[primaryLocale] ?? {};
    const newResults: AllResults = {};
    for (const loc of targetLocales) {
      for (const f of fields) {
        newResults[resultKey(loc, f.key)] = {
          status: "done",
          value: String(baseFields[f.key] ?? ""),
        };
      }
    }
    setResults(newResults);
  }

  function runTranslate() {
    const controller = new AbortController();
    abortRef.current = controller;
    const baseFields = localeData[primaryLocale] ?? {};

    // Set all to loading
    const loading: AllResults = {};
    for (const loc of targetLocales) {
      for (const f of fields) {
        loading[resultKey(loc, f.key)] = { status: "loading", value: "" };
      }
    }
    setResults(loading);

    // Fire requests for each locale × field
    for (const loc of targetLocales) {
      for (const field of fields) {
        const baseValue = String(baseFields[field.key] ?? "");
        const key = resultKey(loc, field.key);

        if (!baseValue.trim()) {
          setResults((prev) => ({
            ...prev,
            [key]: { status: "done", value: "" },
          }));
          continue;
        }

        fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "translate",
            text: baseValue,
            field: field.key,
            fromLocale: primaryLocale,
            toLocale: loc,
            appName,
            charLimit: field.charLimit,
          }),
          signal: controller.signal,
        })
          .then(async (res) => {
            const data = await res.json();
            if (data.error === "ai_auth_error") {
              controller.abort();
              setAuthError(true);
              setResults((prev) => {
                const next = { ...prev };
                for (const k of Object.keys(next)) {
                  if (next[k].status === "loading") {
                    next[k] = { status: "error", value: "" };
                  }
                }
                return next;
              });
              return;
            }
            setResults((prev) => ({
              ...prev,
              [key]: res.ok
                ? { status: "done", value: data.result }
                : { status: "error", value: "" },
            }));
          })
          .catch(() => {
            if (controller.signal.aborted) return;
            setResults((prev) => ({
              ...prev,
              [key]: { status: "error", value: "" },
            }));
          });
      }
    }
  }

  // --- Checkbox logic ---

  function toggleLocale(locale: string) {
    setChecked((prev) => ({ ...prev, [locale]: !prev[locale] }));
  }

  function toggleAll() {
    const allChecked = targetLocales.every((l) => checked[l]);
    const next: Record<string, boolean> = {};
    for (const loc of targetLocales) {
      next[loc] = !allChecked;
    }
    setChecked(next);
  }

  function toggleExpand(locale: string) {
    setExpanded((prev) => ({ ...prev, [locale]: !prev[locale] }));
  }

  // --- Apply ---

  function handleApply() {
    const updates: Record<string, Record<string, string>> = {};
    for (const loc of targetLocales) {
      if (!checked[loc]) continue;
      const fieldUpdates: Record<string, string> = {};
      for (const f of fields) {
        const fr = results[resultKey(loc, f.key)];
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

  const checkedCount = targetLocales.filter((l) => checked[l]).length;
  const allChecked = checkedCount === targetLocales.length;

  const allFinished = targetLocales.every((loc) => {
    const s = localeStatus(loc, fields, results);
    return s === "done" || s === "error" || s === "partial";
  });

  const anyApplicable = targetLocales.some((loc) => {
    if (!checked[loc]) return false;
    return fields.some((f) => results[resultKey(loc, f.key)]?.status === "done");
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

        <ScrollArea className="min-h-0 overflow-hidden">
          <div className="space-y-1 pr-3">
            {targetLocales.map((loc) => {
              const status = localeStatus(loc, fields, results);
              const isOpen = expanded[loc] ?? false;

              // For single-field mode, show result inline below locale name
              if (singleField) {
                const fr = results[resultKey(loc, fields[0].key)];
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
                      <span className="ml-auto flex items-center">
                        {isLoading && (
                          <CircleNotch size={14} className="animate-spin text-muted-foreground" />
                        )}
                        {isError && (
                          <Warning size={14} className="text-destructive" />
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
                    <div className="flex items-center">
                      {status === "loading" && (
                        <CircleNotch size={14} className="animate-spin text-muted-foreground" />
                      )}
                      {status === "done" && (
                        <Check size={14} className="text-green-600" />
                      )}
                      {(status === "error" || status === "partial") && (
                        <Warning size={14} className="text-destructive" />
                      )}
                    </div>
                  </div>

                  <CollapsibleContent>
                    <div className="space-y-3 py-2 pl-10 pr-2">
                      {fields.map((field) => {
                        const key = resultKey(loc, field.key);
                        const fr = results[key];
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
                ? `Apply ${checkedCount} language${checkedCount !== 1 ? "s" : ""}`
                : mode === "copy"
                  ? `Apply ${checkedCount} language${checkedCount !== 1 ? "s" : ""}`
                  : "Translating\u2026"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
