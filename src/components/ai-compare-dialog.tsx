"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CharCount } from "@/components/char-count";
import { useTranslations } from "@/lib/i18n/locale-context";

interface AICompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  currentValue: string;
  /** If set, the proposed value is shown immediately (no API call). */
  proposedValue?: string;
  /** If set, fetches the proposed value from /api/ai on open. */
  apiBody?: Record<string, unknown>;
  /** Whether the field is a single-line input (vs textarea). */
  singleLine?: boolean;
  /** Character limit for the field. */
  charLimit?: number;
  onApply: (value: string) => void;
}

export function AICompareDialog({
  open,
  onOpenChange,
  title,
  currentValue,
  proposedValue,
  apiBody,
  singleLine,
  charLimit,
  onApply,
}: AICompareDialogProps) {
  const t = useTranslations();
  // Fetch state: null = loading/not started, object = completed
  const [fetchResult, setFetchResult] = useState<{
    proposed: string;
    error: string | null;
    /** Key to identify which open cycle produced this result */
    forKey: string;
  } | null>(null);
  // User's edits to the proposed value (overrides fetch result)
  const [editState, setEditState] = useState<{ value: string; forKey: string } | null>(null);

  // Derive a key from the open state + apiBody to detect new fetch cycles
  const fetchKey = open && proposedValue == null && apiBody
    ? JSON.stringify(apiBody)
    : "";
  const resultCurrent = fetchResult?.forKey === fetchKey && fetchKey !== "";
  const baseProposed = proposedValue ?? (resultCurrent ? fetchResult.proposed : "");
  // Only use edit if it matches the current fetch cycle
  const editedValue = editState?.forKey === fetchKey ? editState.value : null;
  const proposed = editedValue ?? baseProposed;
  const loading = fetchKey !== "" && !resultCurrent;
  const error = resultCurrent ? fetchResult.error : null;

  function setProposed(value: string) {
    setEditState({ value, forKey: fetchKey });
  }

  useEffect(() => {
    if (!fetchKey) return;

    let cancelled = false;

    fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiBody),
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setFetchResult({
            proposed: "",
            error: data.error === "ai_auth_error"
              ? t("ai.authError")
              : data.error ?? t("ai.requestFailed"),
            forKey: fetchKey,
          });
        } else {
          setFetchResult({ proposed: data.result, error: null, forKey: fetchKey });
        }
      })
      .catch(() => {
        if (!cancelled) setFetchResult({ proposed: "", error: t("common.networkError"), forKey: fetchKey });
      });

    return () => { cancelled = true; };
  }, [fetchKey, apiBody]);

  const TextField = singleLine ? Input : Textarea;
  const fieldClass = singleLine
    ? "text-sm"
    : "min-h-40 max-h-80 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 min-h-0 flex-1">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">{t("ai.compareCurrent")}</p>
            <TextField
              value={currentValue}
              readOnly
              className={fieldClass}
            />
            <CharCount value={currentValue} limit={charLimit} />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">{t("ai.compareProposed")}</p>
            {loading ? (
              <div className="flex min-h-40 items-center justify-center rounded-md border">
                <Spinner className="size-5 text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex min-h-40 items-center justify-center rounded-md border text-sm text-destructive">
                {error}
              </div>
            ) : (
              <>
                <TextField
                  value={proposed}
                  onChange={(e) => setProposed(e.target.value)}
                  className={fieldClass}
                />
                <CharCount value={proposed} limit={charLimit} />
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("ai.keepCurrent")}
          </Button>
          <Button
            disabled={loading || !!error || !proposed}
            onClick={() => {
              onApply(proposed);
              onOpenChange(false);
            }}
          >
            {t("ai.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
