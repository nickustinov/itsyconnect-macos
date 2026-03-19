"use client";

import { type ReactNode, useEffect } from "react";
import { useParams } from "next/navigation";
import { Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useChangeBuffer } from "@/lib/change-buffer-context";
import { useReviewChanges } from "@/lib/review-changes-context";
import { EmptyState } from "@/components/empty-state";
import { localeName } from "@/lib/asc/locale-names";

const SECTION_LABELS: Record<string, string> = {
  "store-listing": "Store listing",
  details: "App details",
  keywords: "Keywords",
  review: "App review",
};

const FIELD_LABELS: Record<string, string> = {
  description: "Description",
  keywords: "Keywords",
  whatsNew: "What's new",
  promotionalText: "Promotional text",
  supportUrl: "Support URL",
  marketingUrl: "Marketing URL",
  name: "Name",
  subtitle: "Subtitle",
  privacyPolicyUrl: "Privacy policy URL",
  privacyChoicesUrl: "Privacy choices URL",
  copyright: "Copyright",
  releaseType: "Release type",
  scheduledDate: "Scheduled date",
  phasedRelease: "Phased release",
  buildId: "Build",
  contentRights: "Content rights",
  primaryCategoryId: "Primary category",
  secondaryCategoryId: "Secondary category",
  notifUrl: "Notification URL",
  notifSandboxUrl: "Sandbox notification URL",
  notes: "Review notes",
  demoAccountRequired: "Sign-in required",
  demoAccountName: "Demo account name",
  demoAccountPassword: "Demo account password",
  contactFirstName: "First name",
  contactLastName: "Last name",
  contactPhone: "Phone",
  contactEmail: "Email",
};

import type { ReviewViewMode as ViewMode } from "@/lib/review-changes-context";

// --- Word-level diff ---

interface DiffSegment {
  text: string;
  type: "equal" | "added" | "removed";
}

function diffWords(oldText: string, newText: string): DiffSegment[] {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);

  const m = oldWords.length;
  const n = newWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldWords[i - 1] === newWords[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const segments: DiffSegment[] = [];
  let i = m, j = n;
  const stack: DiffSegment[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      stack.push({ text: oldWords[i - 1], type: "equal" });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ text: newWords[j - 1], type: "added" });
      j--;
    } else {
      stack.push({ text: oldWords[i - 1], type: "removed" });
      i--;
    }
  }

  stack.reverse();

  for (const seg of stack) {
    const last = segments[segments.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      segments.push({ ...seg });
    }
  }

  return segments;
}

function UnifiedDiff({ segments }: { segments: DiffSegment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "equal") return <span key={i}>{seg.text}</span>;
        if (seg.type === "removed") {
          return (
            <span key={i} className="bg-red-500/15 text-red-700 dark:text-red-400 line-through decoration-red-400/50">
              {seg.text}
            </span>
          );
        }
        return (
          <span key={i} className="bg-green-500/15 text-green-700 dark:text-green-400">
            {seg.text}
          </span>
        );
      })}
    </>
  );
}

// --- Diff field ---

function DiffField({ label, oldValue, newValue, mode, onDiscard }: {
  label: string;
  oldValue: string;
  newValue: string;
  mode: ViewMode;
  onDiscard: () => void;
}) {
  if (oldValue === newValue) return null;

  let content: ReactNode;

  if (mode === "before") {
    content = oldValue
      ? <span>{oldValue}</span>
      : <span className="italic text-muted-foreground">Empty</span>;
  } else if (mode === "after") {
    content = newValue
      ? <span>{newValue}</span>
      : <span className="italic text-muted-foreground">Empty</span>;
  } else {
    if (!oldValue && newValue) {
      content = <span className="bg-green-500/15 text-green-700 dark:text-green-400">{newValue}</span>;
    } else if (oldValue && !newValue) {
      content = (
        <span className="bg-red-500/15 text-red-700 dark:text-red-400 line-through decoration-red-400/50">
          {oldValue}
        </span>
      );
    } else {
      const segments = diffWords(oldValue, newValue);
      const equalChars = segments
        .filter((s) => s.type === "equal")
        .reduce((sum, s) => sum + s.text.replace(/\s/g, "").length, 0);
      const totalChars = Math.max(
        oldValue.replace(/\s/g, "").length,
        newValue.replace(/\s/g, "").length,
        1,
      );
      // If less than 30% of content is shared, show stacked before/after
      if (equalChars / totalChars < 0.3) {
        content = (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-red-200 bg-red-500/5 p-2 dark:border-red-900">
              <span className="text-red-700 dark:text-red-400">{oldValue}</span>
            </div>
            <div className="rounded border border-green-200 bg-green-500/5 p-2 dark:border-green-900">
              <span className="text-green-700 dark:text-green-400">{newValue}</span>
            </div>
          </div>
        );
      } else {
        content = <UnifiedDiff segments={segments} />;
      }
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <button
          type="button"
          onClick={onDiscard}
          className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
        >
          Discard
        </button>
      </div>
      <div className="rounded-md border px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-all bg-muted/30">
        {content}
      </div>
    </div>
  );
}

// --- Section diff ---

function SectionDiff({
  appId,
  section,
  scope,
  data,
  originalData,
  mode,
  localeFilter,
  fieldFilter,
}: {
  appId: string;
  section: string;
  scope: string;
  data: Record<string, unknown>;
  originalData: Record<string, unknown>;
  mode: ViewMode;
  localeFilter: string;
  fieldFilter: string;
}) {
  const { discardField } = useChangeBuffer();

  // Collect locale-level diffs
  const localeDiffs: { locale: string; field: string; oldVal: string; newVal: string }[] = [];
  const dataLocales = (data.locales ?? {}) as Record<string, Record<string, string>>;
  const origLocales = (originalData.locales ?? {}) as Record<string, Record<string, string>>;

  for (const [locale, fields] of Object.entries(dataLocales)) {
    if (localeFilter !== "all" && locale !== localeFilter) continue;
    const origFields = origLocales[locale] ?? {};
    for (const [key, val] of Object.entries(fields)) {
      if (fieldFilter !== "all" && key !== fieldFilter) continue;
      const origVal = origFields[key] ?? "";
      if (val !== origVal) {
        localeDiffs.push({ locale, field: key, oldVal: origVal, newVal: val });
      }
    }
  }

  // Collect non-locale diffs
  const attrDiffs: { key: string; oldVal: string; newVal: string }[] = [];
  const skipKeys = new Set(["locales", "localeIds", "phasedReleaseId", "_reviewDetailId"]);
  for (const [key, val] of Object.entries(data)) {
    if (skipKeys.has(key)) continue;
    if (fieldFilter !== "all" && key !== fieldFilter) continue;
    const origVal = originalData[key];
    const valStr = val == null ? "" : String(val);
    const origStr = origVal == null ? "" : String(origVal);
    if (valStr !== origStr) {
      attrDiffs.push({ key, oldVal: origStr, newVal: valStr });
    }
  }

  const totalDiffs = localeDiffs.length + attrDiffs.length;
  if (totalDiffs === 0) return null;

  return (
    <div className="space-y-4">
      {localeDiffs.map((d) => (
        <DiffField
          key={`${d.locale}:${d.field}`}
          label={`${localeName(d.locale)} – ${FIELD_LABELS[d.field] ?? d.field}`}
          oldValue={d.oldVal}
          newValue={d.newVal}
          mode={mode}
          onDiscard={() => discardField(appId, section, scope, d.locale, d.field)}
        />
      ))}
      {attrDiffs.map((d) => (
        <DiffField
          key={d.key}
          label={FIELD_LABELS[d.key] ?? d.key}
          oldValue={d.oldVal}
          newValue={d.newVal}
          mode={mode}
          onDiscard={() => discardField(appId, section, scope, null, d.key)}
        />
      ))}
    </div>
  );
}

// --- Page ---

export default function ReviewChangesPage() {
  const { appId } = useParams<{ appId: string }>();
  const { changes, discardSection, discardField } = useChangeBuffer();
  const { mode, localeFilter, fieldFilter, setFieldFilter } = useReviewChanges();

  const appChanges = changes.filter((c) => c.appId === appId);

  // Reset stale field filter
  useEffect(() => {
    if (fieldFilter === "all") return;
    const hasField = appChanges.some((c) => {
      const locales = (c.data.locales ?? {}) as Record<string, Record<string, unknown>>;
      for (const fields of Object.values(locales)) {
        if (fieldFilter in fields) return true;
      }
      return fieldFilter in c.data;
    });
    if (!hasField) setFieldFilter("all");
  }, [fieldFilter, appChanges, setFieldFilter]);

  if (appChanges.length === 0) {
    return (
      <EmptyState
        title="You're all caught up"
        description="No pending changes to push to App Store Connect."
      />
    );
  }

  // Group changes by section, filtering out sections with no visible diffs
  const sectionOrder = ["store-listing", "details", "keywords", "review"];
  const skipKeys = new Set(["locales", "localeIds", "phasedReleaseId", "_reviewDetailId"]);

  function sectionHasVisibleDiffs(c: typeof appChanges[number]): boolean {
    const dl = (c.data.locales ?? {}) as Record<string, Record<string, string>>;
    const ol = (c.originalData.locales ?? {}) as Record<string, Record<string, string>>;
    for (const [locale, fields] of Object.entries(dl)) {
      if (localeFilter !== "all" && locale !== localeFilter) continue;
      for (const [key, val] of Object.entries(fields)) {
        if (fieldFilter !== "all" && key !== fieldFilter) continue;
        if (val !== (ol[locale]?.[key] ?? "")) return true;
      }
    }
    for (const [key, val] of Object.entries(c.data)) {
      if (skipKeys.has(key)) continue;
      if (fieldFilter !== "all" && key !== fieldFilter) continue;
      if (String(val ?? "") !== String(c.originalData[key] ?? "")) return true;
    }
    return false;
  }

  const grouped = sectionOrder
    .map((s) => ({
      section: s,
      changes: appChanges.filter((c) => c.section === s && sectionHasVisibleDiffs(c)),
    }))
    .filter((g) => g.changes.length > 0);

  const isFiltered = fieldFilter !== "all" || localeFilter !== "all";

  function handleDiscardGroup(group: typeof grouped[number]) {
    if (fieldFilter === "all" && localeFilter === "all") {
      // Discard entire section
      for (const c of group.changes) discardSection(appId, c.section, c.scope);
    } else {
      // Discard only filtered fields
      for (const c of group.changes) {
        const dl = (c.data.locales ?? {}) as Record<string, Record<string, string>>;
        for (const [locale, fields] of Object.entries(dl)) {
          if (localeFilter !== "all" && locale !== localeFilter) continue;
          for (const key of Object.keys(fields)) {
            if (fieldFilter !== "all" && key !== fieldFilter) continue;
            discardField(appId, c.section, c.scope, locale, key);
          }
        }
        for (const key of Object.keys(c.data)) {
          if (skipKeys.has(key)) continue;
          if (fieldFilter !== "all" && key !== fieldFilter) continue;
          discardField(appId, c.section, c.scope, null, key);
        }
      }
    }
  }

  return (
    <div className="space-y-8">
      {grouped.map((group) => (
        <div key={group.section} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{SECTION_LABELS[group.section] ?? group.section}</h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => handleDiscardGroup(group)}
            >
              <Trash size={14} className="mr-1.5" />
              {isFiltered ? "Discard filtered" : "Discard section"}
            </Button>
          </div>
          {group.changes.map((change) => (
            <SectionDiff
              key={`${change.section}:${change.scope}`}
              appId={appId}
              section={change.section}
              scope={change.scope}
              data={change.data}
              originalData={change.originalData}
              mode={mode}
              localeFilter={localeFilter}
              fieldFilter={fieldFilter}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
