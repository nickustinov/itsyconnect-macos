"use client";

import { useState } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/lib/i18n/locale-context";

interface GuidanceFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the field loses focus – persist the value here. */
  onBlur?: () => void;
}

/**
 * Expandable inline editor for the shared AI guidance. Collapsed by default
 * (with a preview when set); expands to a textarea. The value persists globally
 * and applies to every AI action, so it only needs to be set once.
 */
export function GuidanceField({ value, onChange, onBlur }: GuidanceFieldProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <CaretRight
          size={12}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="text-sm font-medium">{t("guidanceField.title")}</span>
        {!open && (
          <span className="truncate text-xs text-muted-foreground">
            {value ? value : t("guidanceField.collapsedPlaceholder")}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={t("guidanceField.placeholder")}
            className="min-h-20 text-sm"
            maxLength={2000}
            autoFocus
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t("guidanceField.hint")}
          </p>
        </div>
      )}
    </div>
  );
}
