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
  const [proposed, setProposed] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setError(null);

    // Immediate value (e.g. Copy)
    if (proposedValue != null) {
      setProposed(proposedValue);
      setLoading(false);
      return;
    }

    // Fetch from AI
    if (!apiBody) return;

    setProposed("");
    setLoading(true);

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
          setError(
            data.error === "ai_auth_error"
              ? "Your API key is invalid or revoked. Update it in AI settings."
              : data.error ?? "Request failed",
          );
        } else {
          setProposed(data.result);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Network error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, proposedValue, apiBody]);

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
            <p className="text-sm font-medium text-muted-foreground">Current</p>
            <TextField
              value={currentValue}
              readOnly
              className={fieldClass}
            />
            <CharCount value={currentValue} limit={charLimit} />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">Proposed</p>
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
            Keep current
          </Button>
          <Button
            disabled={loading || !!error || !proposed}
            onClick={() => {
              onApply(proposed);
              onOpenChange(false);
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
