"use client";

import { useState, useEffect, useRef } from "react";
import { Check, Warning, CircleNotch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { localeName } from "@/lib/asc/locale-names";
import { CharCount } from "@/components/char-count";

export interface BulkField {
  key: string;
  label: string;
  charLimit?: number;
}

interface BulkAIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "translate" | "copy";
  targetLocale: string;
  primaryLocale: string;
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
  const [results, setResults] = useState<Record<string, FieldResult>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [authError, setAuthError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Run on open
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    // Init state
    setAuthError(false);
    const initialChecked: Record<string, boolean> = {};
    for (const f of fields) {
      initialChecked[f.key] = true;
    }
    setChecked(initialChecked);

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
    const newResults: Record<string, FieldResult> = {};
    for (const f of fields) {
      newResults[f.key] = {
        status: "done",
        value: String(baseFields[f.key] ?? ""),
      };
    }
    setResults(newResults);
  }

  function runTranslate() {
    const controller = new AbortController();
    abortRef.current = controller;
    const baseFields = localeData[primaryLocale] ?? {};

    // Set all to loading
    const loading: Record<string, FieldResult> = {};
    for (const f of fields) {
      loading[f.key] = { status: "loading", value: "" };
    }
    setResults(loading);

    for (const field of fields) {
      const baseValue = String(baseFields[field.key] ?? "");
      if (!baseValue.trim()) {
        setResults((prev) => ({
          ...prev,
          [field.key]: { status: "done", value: "" },
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
          toLocale: targetLocale,
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
              for (const f of fields) {
                if (next[f.key]?.status === "loading") {
                  next[f.key] = { status: "error", value: "" };
                }
              }
              return next;
            });
            return;
          }
          setResults((prev) => ({
            ...prev,
            [field.key]: res.ok
              ? { status: "done", value: data.result }
              : { status: "error", value: "" },
          }));
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResults((prev) => ({
            ...prev,
            [field.key]: { status: "error", value: "" },
          }));
        });
    }
  }

  // --- Checkbox logic ---

  function toggleField(fieldKey: string) {
    setChecked((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  }

  function toggleAll() {
    const allChecked = fields.every((f) => checked[f.key]);
    const newVal = !allChecked;
    const next: Record<string, boolean> = {};
    for (const f of fields) {
      next[f.key] = newVal;
    }
    setChecked(next);
  }

  // --- Apply ---

  function handleApply() {
    const fieldUpdates: Record<string, string> = {};
    for (const f of fields) {
      if (!checked[f.key]) continue;
      const fr = results[f.key];
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

  const checkedCount = fields.filter((f) => checked[f.key]).length;
  const allChecked = checkedCount === fields.length;

  const allFinished = fields.every((f) => {
    const s = results[f.key]?.status;
    return s === "done" || s === "error";
  });

  const anyApplicable = fields.some(
    (f) => checked[f.key] && results[f.key]?.status === "done",
  );

  const targetLabel = localeName(targetLocale);
  const baseLabel = localeName(primaryLocale);
  const title =
    mode === "translate"
      ? `Translate all fields to ${targetLabel}`
      : `Copy all fields from ${baseLabel}`;

  const currentFields = localeData[targetLocale] ?? {};

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
          <div className="space-y-4 pr-3">
            {fields.map((field) => {
              const fr = results[field.key];
              const before = String(currentFields[field.key] ?? "");
              const after = fr?.status === "done" ? fr.value : "";
              const isLoading = fr?.status === "loading";
              const isError = fr?.status === "error";
              const unchanged = fr?.status === "done" && before === after;

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
                        Failed
                      </span>
                    )}
                    {unchanged && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Check size={12} />
                        No change
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0 pl-6">
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">
                      Before
                    </p>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">
                      After
                    </p>
                    {/* Both cells share the same grid row so they match height */}
                    <div className="max-h-32 overflow-y-auto rounded border bg-muted/40 px-2.5 py-2 text-xs whitespace-pre-wrap">
                      {before || (
                        <span className="italic text-muted-foreground">
                          Empty
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
                        Translation failed
                      </div>
                    ) : (
                      <div className="max-h-32 overflow-y-auto rounded border bg-muted/40 px-2.5 py-2 text-xs whitespace-pre-wrap">
                        {after || (
                          <span className="italic text-muted-foreground">
                            Empty
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
                ? `Apply ${checkedCount} field${checkedCount !== 1 ? "s" : ""}`
                : mode === "copy"
                  ? `Apply ${checkedCount} field${checkedCount !== 1 ? "s" : ""}`
                  : "Translating\u2026"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
