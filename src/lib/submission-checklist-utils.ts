import type { LocaleFields } from "@/app/dashboard/apps/[appId]/store-listing/_components/locale-fields";
import { FIELD_MIN_LIMITS } from "@/lib/asc/locale-names";
import type { FieldIssues, ChecklistFlags } from "@/lib/submission-checklist-context";

type CheckedField = "description" | "whatsNew" | "keywords";

/**
 * Compute the status for a single field across all locales.
 *
 * - `"missing"` – primary locale is empty / below minLength
 * - `"warn"` – primary OK but one or more secondary locales are empty / below minLength
 * - `"ok"` – every locale passes
 */
export function computeFieldIssues(
  localeData: Record<string, LocaleFields>,
  primaryLocale: string,
  field: CheckedField,
  minLength: number,
): FieldIssues {
  const primary = localeData[primaryLocale];
  if (!primary || (primary[field]?.length ?? 0) < minLength) {
    return { status: "missing", localesWithIssues: [] };
  }

  const failing: string[] = [];
  for (const [locale, fields] of Object.entries(localeData)) {
    if (locale === primaryLocale) continue;
    if ((fields[field]?.length ?? 0) < minLength) {
      failing.push(locale);
    }
  }

  if (failing.length > 0) {
    return { status: "warn", localesWithIssues: failing };
  }
  return { status: "ok", localesWithIssues: [] };
}

/**
 * Compute checklist flags for all three submission-required fields.
 */
export function computeChecklistFlags(
  localeData: Record<string, LocaleFields>,
  primaryLocale: string,
): ChecklistFlags {
  return {
    description: computeFieldIssues(localeData, primaryLocale, "description", FIELD_MIN_LIMITS.description ?? 10),
    whatsNew: computeFieldIssues(localeData, primaryLocale, "whatsNew", FIELD_MIN_LIMITS.whatsNew ?? 4),
    keywords: computeFieldIssues(localeData, primaryLocale, "keywords", 1),
  };
}
