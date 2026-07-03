"use client";

import { CheckCircle, Circle } from "@phosphor-icons/react";
import { useTranslations } from "@/lib/i18n/locale-context";
import { LIMITS, type NominationFormData } from "./nomination-constants";

export function NominationChecklist({ form }: { form: NominationFormData }) {
  const t = useTranslations();

  const items = [
    { label: t("nominations.form.name"), ok: form.name.trim().length > 0 && form.name.length <= LIMITS.name },
    { label: t("nominations.form.description"), ok: form.description.trim().length > 0 && form.description.length <= LIMITS.description },
    { label: t("nominations.form.publishDate"), ok: !!form.publishStartDate },
    { label: t("nominations.form.relatedApps"), ok: form.relatedAppIds.length > 0 },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((item) => (
        <span
          key={item.label}
          className={`flex items-center gap-1 text-xs ${item.ok ? "text-muted-foreground" : "text-muted-foreground/60"}`}
        >
          {item.ok ? (
            <CheckCircle size={14} weight="fill" className="text-green-500/70" />
          ) : (
            <Circle size={14} />
          )}
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function useNominationChecklistReady(form: NominationFormData): boolean {
  return (
    form.name.trim().length > 0 &&
    form.name.length <= LIMITS.name &&
    form.description.trim().length > 0 &&
    form.description.length <= LIMITS.description &&
    !!form.publishStartDate &&
    form.relatedAppIds.length > 0
  );
}
