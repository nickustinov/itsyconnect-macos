"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { CharCount } from "@/components/char-count";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CaretRight, Info, MagicWand } from "@phosphor-icons/react";
import { localeName, FIELD_LIMITS } from "@/lib/asc/locale-names";
import { buildForbiddenKeywords } from "@/lib/asc/keyword-utils";
import { useAIStatus } from "@/lib/hooks/use-ai-status";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreListingFields {
  description: string;
  whatsNew: string;
  promotionalText: string;
  keywords: string;
  supportUrl: string;
  marketingUrl: string;
}

interface AppDetailsFields {
  name: string;
  subtitle: string;
  privacyPolicyUrl: string;
  privacyChoicesUrl: string;
}

interface FieldState {
  value: string;
  translating: boolean;
  checked: boolean;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AddLocaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  appId: string;
  primaryLocale: string;
  appName?: string;
  /** Version ID for store listing localizations. */
  versionId: string;
  /** App info ID for app details localizations. */
  appInfoId: string;
  /** Whether this is the first version (whats new not applicable). */
  isFirstVersion?: boolean;
  /** Called after locale is successfully created. Pages should refresh. */
  onCreated: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORE_LISTING_TEXT_FIELDS: (keyof StoreListingFields)[] = [
  "description",
  "whatsNew",
  "promotionalText",
];

const STORE_LISTING_URL_FIELDS: (keyof StoreListingFields)[] = [
  "supportUrl",
  "marketingUrl",
];

const APP_DETAILS_TEXT_FIELDS: (keyof AppDetailsFields)[] = [
  "name",
  "subtitle",
];

const APP_DETAILS_URL_FIELDS: (keyof AppDetailsFields)[] = [
  "privacyPolicyUrl",
  "privacyChoicesUrl",
];

const FIELD_LABELS: Record<string, string> = {
  description: "Description",
  whatsNew: "What's new",
  promotionalText: "Promotional text",
  keywords: "Keywords",
  supportUrl: "Support URL",
  marketingUrl: "Marketing URL",
  name: "Name",
  subtitle: "Subtitle",
  privacyPolicyUrl: "Privacy policy URL",
  privacyChoicesUrl: "Privacy choices URL",
};

function isTextField(field: string): boolean {
  return [...STORE_LISTING_TEXT_FIELDS, ...APP_DETAILS_TEXT_FIELDS].includes(field as never);
}

function isMultiLine(field: string): boolean {
  return field === "description" || field === "whatsNew" || field === "promotionalText";
}

// All translatable text fields (not URLs)
const ALL_TEXT_FIELDS = [
  ...STORE_LISTING_TEXT_FIELDS,
  "keywords" as const,
  ...APP_DETAILS_TEXT_FIELDS,
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddLocaleDialog({
  open,
  onOpenChange,
  locale,
  appId,
  primaryLocale,
  appName,
  versionId,
  appInfoId,
  isFirstVersion,
  onCreated,
}: AddLocaleDialogProps) {
  const { configured: aiConfigured } = useAIStatus();

  // Section-level checkboxes
  const [storeListingEnabled, setStoreListingEnabled] = useState(true);
  const [appDetailsEnabled, setAppDetailsEnabled] = useState(true);

  // Per-field state
  const [fields, setFields] = useState<Record<string, FieldState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [translated, setTranslated] = useState(false);

  // Existing localization IDs (if locale already exists in ASC)
  const existingIdsRef = useRef<{ version?: string; appInfo?: string }>({});

  // Store base data so we can translate from it on demand
  const baseDataRef = useRef<{
    storeListing: StoreListingFields;
    appDetails: AppDetailsFields;
    otherKeywords: string[];
  } | null>(null);

  // Track whether we've already started for this open
  const initiatedRef = useRef(false);

  const updateField = useCallback(
    (field: string, updates: Partial<FieldState>) => {
      setFields((prev) => ({
        ...prev,
        [field]: { ...prev[field], ...updates },
      }));
    },
    [],
  );

  // Translate a single field
  const translateField = useCallback(
    async (field: string, baseValue: string) => {
      if (!baseValue.trim()) return;
      console.log("[add-locale] translateField: start", field, `(${baseValue.length} chars)`);
      updateField(field, { translating: true });
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "translate",
            text: baseValue,
            field,
            fromLocale: primaryLocale,
            toLocale: locale,
            appName,
            charLimit: FIELD_LIMITS[field],
          }),
        });
        console.log("[add-locale] translateField: response", field, res.status);
        if (res.ok) {
          const data = await res.json();
          updateField(field, { value: data.result, translating: false });
          return data.result as string;
        }
      } catch (err) {
        console.error("[add-locale] translateField: error", field, err);
      }
      updateField(field, { translating: false });
      return undefined;
    },
    [locale, primaryLocale, appName, updateField],
  );

  // Fix keywords: dedupe, remove forbidden, fill budget
  const fixKeywords = useCallback(
    async (translatedKeywords: string, description: string, subtitle: string, forbiddenWords: string[]) => {
      console.log("[add-locale] fixKeywords: start", `(${translatedKeywords.length} chars, ${forbiddenWords.length} forbidden)`);
      updateField("keywords", { translating: true });
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "fix-keywords",
            text: translatedKeywords,
            field: "keywords",
            locale,
            appName,
            subtitle: subtitle || undefined,
            description: description || undefined,
            charLimit: FIELD_LIMITS.keywords,
            forbiddenWords,
          }),
        });
        console.log("[add-locale] fixKeywords: response", res.status);
        if (res.ok) {
          const data = await res.json();
          updateField("keywords", { value: data.result, translating: false });
          return;
        }
      } catch (err) {
        console.error("[add-locale] fixKeywords: error", err);
      }
      updateField("keywords", { translating: false });
    },
    [locale, appName, updateField],
  );

  // Fetch base data when dialog opens (no auto-translate)
  useEffect(() => {
    if (!open || initiatedRef.current) return;
    initiatedRef.current = true;

    setLoading(true);
    setError(null);

    async function init() {
      console.log("[add-locale] init: fetching base data for", locale);
      const [versionRes, infoRes] = await Promise.all([
        fetch(`/api/apps/${appId}/versions/${versionId}/localizations?refresh`),
        fetch(`/api/apps/${appId}/info/${appInfoId}/localizations?refresh`),
      ]);
      console.log("[add-locale] init: fetched version=%d info=%d", versionRes.status, infoRes.status);

      if (!versionRes.ok || !infoRes.ok) {
        setError("Failed to load base locale data");
        setLoading(false);
        return;
      }

      const versionData = await versionRes.json();
      const infoData = await infoRes.json();

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const versionLocalizations = versionData.localizations ?? [];
      const infoLocalizations = infoData.localizations ?? [];
      const baseLoc = versionLocalizations.find(
        (l: any) => l.attributes.locale === primaryLocale,
      );
      const baseInfo = infoLocalizations.find(
        (l: any) => l.attributes.locale === primaryLocale,
      );
      const existingVersionLoc = versionLocalizations.find(
        (l: any) => l.attributes.locale === locale,
      );
      const existingInfoLoc = infoLocalizations.find(
        (l: any) => l.attributes.locale === locale,
      );
      /* eslint-enable @typescript-eslint/no-explicit-any */
      existingIdsRef.current = {
        version: existingVersionLoc?.id,
        appInfo: existingInfoLoc?.id,
      };

      const baseStoreListing: StoreListingFields = {
        description: baseLoc?.attributes.description ?? "",
        whatsNew: baseLoc?.attributes.whatsNew ?? "",
        promotionalText: baseLoc?.attributes.promotionalText ?? "",
        keywords: baseLoc?.attributes.keywords ?? "",
        supportUrl: baseLoc?.attributes.supportUrl ?? "",
        marketingUrl: baseLoc?.attributes.marketingUrl ?? "",
      };

      const baseAppDetails: AppDetailsFields = {
        name: baseInfo?.attributes.name ?? "",
        subtitle: baseInfo?.attributes.subtitle ?? "",
        privacyPolicyUrl: baseInfo?.attributes.privacyPolicyUrl ?? "",
        privacyChoicesUrl: baseInfo?.attributes.privacyChoicesUrl ?? "",
      };

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const otherKeywords = (versionLocalizations ?? [])
        .filter((l: any) => l.attributes.locale !== locale)
        .map((l: any) => (l.attributes.keywords ?? "") as string);
      /* eslint-enable @typescript-eslint/no-explicit-any */

      // Store base data for later translation
      baseDataRef.current = {
        storeListing: baseStoreListing,
        appDetails: baseAppDetails,
        otherKeywords,
      };

      // Initialise all fields with base values (including keywords)
      const initial: Record<string, FieldState> = {};

      for (const f of [...STORE_LISTING_TEXT_FIELDS, ...STORE_LISTING_URL_FIELDS]) {
        initial[f] = {
          value: baseStoreListing[f],
          translating: false,
          checked: f !== "whatsNew" || !isFirstVersion,
        };
      }
      initial.keywords = {
        value: baseStoreListing.keywords,
        translating: false,
        checked: true,
      };

      for (const f of [...APP_DETAILS_TEXT_FIELDS, ...APP_DETAILS_URL_FIELDS]) {
        initial[f] = {
          value: baseAppDetails[f],
          translating: false,
          checked: true,
        };
      }

      setFields(initial);
      setLoading(false);
      console.log("[add-locale] init: done, fields initialised for", locale);
    }

    init().catch((err) => {
      console.error("[add-locale] init: failed", err);
      setError("Failed to initialise");
      setLoading(false);
    });
  }, [open, appId, versionId, appInfoId, primaryLocale, locale, isFirstVersion]);

  // Translate checked fields on demand
  const handleTranslate = useCallback(async () => {
    const base = baseDataRef.current;
    if (!base) return;
    console.log("[add-locale] handleTranslate: start");

    setFields((prev) => {
      const next = { ...prev };
      for (const f of ALL_TEXT_FIELDS) {
        if (f === "whatsNew" && isFirstVersion) continue;
        if (!next[f]?.checked) continue;
        // Check section-level enable
        const isStore = [...STORE_LISTING_TEXT_FIELDS, "keywords"].includes(f);
        if (isStore && !storeListingEnabled) continue;
        if (!isStore && !appDetailsEnabled) continue;
        next[f] = { ...next[f], translating: true };
      }
      return next;
    });

    // Translate text fields in parallel (not keywords)
    const textFields = ALL_TEXT_FIELDS.filter((f) => f !== "keywords");
    let descResult: string | undefined;
    let subtitleResult: string | undefined;

    const promises = textFields.map(async (f) => {
      if (f === "whatsNew" && isFirstVersion) return;
      // Check if field is checked and section is enabled
      const isStore = STORE_LISTING_TEXT_FIELDS.includes(f as keyof StoreListingFields);
      if (isStore && !storeListingEnabled) return;
      if (!isStore && !appDetailsEnabled) return;

      // Read checked state from current fields
      const fieldState = fields[f];
      if (!fieldState?.checked) return;

      const baseValue = isStore
        ? base.storeListing[f as keyof StoreListingFields]
        : base.appDetails[f as keyof AppDetailsFields];

      if (!baseValue?.trim()) {
        updateField(f, { translating: false });
        return;
      }

      const result = await translateField(f, baseValue);
      if (f === "description") descResult = result;
      if (f === "subtitle") subtitleResult = result;
    });

    await Promise.all(promises);
    console.log("[add-locale] handleTranslate: text fields done");

    // Keywords: translate → strip forbidden → fill budget
    const keywordsChecked = fields.keywords?.checked && storeListingEnabled;
    if (keywordsChecked && base.storeListing.keywords.trim()) {
      console.log("[add-locale] handleTranslate: keywords step 1 – translate");
      // Step 1: Translate base keywords
      const translatedKw = await translateField("keywords", base.storeListing.keywords);

      const finalSubtitle = subtitleResult ?? base.appDetails.subtitle;
      const finalDesc = descResult ?? base.storeListing.description;
      const forbidden = buildForbiddenKeywords({
        appName,
        subtitle: finalSubtitle || undefined,
        otherLocaleKeywords: base.otherKeywords,
      });

      // Step 2: Strip forbidden words client-side before fix-keywords
      // (The API protects `text` keywords from stripping, so we must clean first)
      const forbiddenSet = new Set(forbidden.map((w) => w.toLowerCase()));
      const raw = (translatedKw ?? base.storeListing.keywords)
        .split(",")
        .map((w) => w.trim())
        .filter((w) => w && !forbiddenSet.has(w.toLowerCase()))
        .join(",");

      // Step 3: Fill remaining budget with new locale-specific keywords
      console.log("[add-locale] handleTranslate: keywords step 3 – fix-keywords");
      await fixKeywords(raw, finalDesc, finalSubtitle, forbidden);
    } else if (keywordsChecked) {
      updateField("keywords", { translating: false });
    }

    console.log("[add-locale] handleTranslate: complete");
    setTranslated(true);
  }, [
    fields,
    isFirstVersion,
    storeListingEnabled,
    appDetailsEnabled,
    appName,
    translateField,
    fixKeywords,
    updateField,
  ]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      initiatedRef.current = false;
      baseDataRef.current = null;
      setFields({});
      setLoading(true);
      setError(null);
      setSaving(false);
      setTranslated(false);
      setStoreListingEnabled(true);
      setAppDetailsEnabled(true);
    }
  }, [open]);

  // Save – create localizations via API
  async function handleCreate() {
    console.log("[add-locale] handleCreate: start", locale);
    setSaving(true);
    setError(null);

    try {
      // Step 1: Create version localization.
      // Apple auto-creates the appInfo localization when a version localization is added.
      if (storeListingEnabled) {
        const storeFields: Record<string, string> = {};
        for (const f of [...STORE_LISTING_TEXT_FIELDS, ...STORE_LISTING_URL_FIELDS, "keywords" as const]) {
          if (f === "whatsNew" && isFirstVersion) continue;
          const fs = fields[f];
          if (fs?.checked && fs.value.trim()) {
            storeFields[f] = fs.value;
          }
        }
        console.log("[add-locale] handleCreate: saving version localization", Object.keys(storeFields));
        const res = await fetch(`/api/apps/${appId}/versions/${versionId}/localizations`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locales: { [locale]: storeFields },
            originalLocaleIds: existingIdsRef.current.version
              ? { [locale]: existingIdsRef.current.version }
              : {},
          }),
        });
        const data = await res.json();
        console.log("[add-locale] handleCreate: version localization response", res.status, data);
        if (data.errors?.length > 0) {
          throw new Error(data.errors[0].message);
        }
      }

      console.log("[add-locale] handleCreate: step 1 done");
      // Step 2: Update the auto-created appInfo localization with user's app details fields.
      if (appDetailsEnabled) {
        const detailFields: Record<string, string> = {};
        for (const f of [...APP_DETAILS_TEXT_FIELDS, ...APP_DETAILS_URL_FIELDS]) {
          const fs = fields[f];
          if (fs?.checked && fs.value.trim()) {
            detailFields[f] = fs.value;
          }
        }
        if (Object.keys(detailFields).length > 0) {
          console.log("[add-locale] handleCreate: fetching app info localizations to find auto-created ID");
          // Fetch to find the auto-created localization ID
          const listRes = await fetch(
            `/api/apps/${appId}/info/${appInfoId}/localizations?refresh`,
          );
          console.log("[add-locale] handleCreate: app info list response", listRes.status);
          if (listRes.ok) {
            const listData = await listRes.json();
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const autoCreated = (listData.localizations ?? []).find(
              (l: any) => l.attributes.locale === locale,
            );
            /* eslint-enable @typescript-eslint/no-explicit-any */
            if (autoCreated) {
              console.log("[add-locale] handleCreate: patching app info localization", autoCreated.id);
              // PATCH the auto-created localization
              const res = await fetch(`/api/apps/${appId}/info/${appInfoId}/localizations`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  locales: { [locale]: detailFields },
                  originalLocaleIds: { [locale]: autoCreated.id },
                }),
              });
              const data = await res.json();
              console.log("[add-locale] handleCreate: app info patch response", res.status, data);
              if (data.errors?.length > 0) {
                throw new Error(data.errors[0].message);
              }
            } else {
              console.log("[add-locale] handleCreate: auto-created app info localization not found for", locale);
            }
          }
        }
      }

      console.log("[add-locale] handleCreate: success");
      toast.success(`Added ${localeName(locale)}`);
      onOpenChange(false);
      onCreated();
    } catch (err) {
      console.error("[add-locale] handleCreate: error", err);
      setError(err instanceof Error ? err.message : "Failed to create locale");
    } finally {
      setSaving(false);
    }
  }

  const storeListingFields = [...STORE_LISTING_TEXT_FIELDS, "keywords" as const, ...STORE_LISTING_URL_FIELDS];
  const appDetailsFields = [...APP_DETAILS_TEXT_FIELDS, ...APP_DETAILS_URL_FIELDS];
  const storeListingTranslating = storeListingFields.some((f) => fields[f]?.translating);
  const appDetailsTranslating = appDetailsFields.some((f) => fields[f]?.translating);
  const anyTranslating = storeListingTranslating || appDetailsTranslating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] !grid grid-rows-[auto_1fr_auto] gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>
            Add {localeName(locale)}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              {locale}
            </span>
          </DialogTitle>
          <DialogDescription>
            {translated
              ? `Translated from ${localeName(primaryLocale)}. Review the fields and uncheck any you don't want to include.`
              : `Fields are copied from ${localeName(primaryLocale)}. Review, uncheck any you don't want, then translate with AI or add as-is.`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 overflow-hidden">
          <div className="pr-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="size-5" />
              </div>
            ) : error && Object.keys(fields).length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {error}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Store listing section */}
                <FieldSection
                  title="Store listing"
                  checked={storeListingEnabled}
                  onCheckedChange={setStoreListingEnabled}
                  translating={storeListingTranslating}
                >
                  {STORE_LISTING_TEXT_FIELDS.map((f) => {
                    if (f === "whatsNew" && isFirstVersion) return null;
                    return (
                      <FieldRow
                        key={f}
                        field={f}
                        state={fields[f]}
                        disabled={!storeListingEnabled}
                        onCheckedChange={(v) => updateField(f, { checked: v })}
                        onValueChange={(v) => updateField(f, { value: v })}
                      />
                    );
                  })}
                  <FieldRow
                    field="keywords"
                    state={fields.keywords}
                    disabled={!storeListingEnabled}
                    onCheckedChange={(v) => updateField("keywords", { checked: v })}
                    onValueChange={(v) => updateField("keywords", { value: v })}
                    hint={translated ? "Translated, deduped, and optimised" : undefined}
                  />
                  {STORE_LISTING_URL_FIELDS.map((f) => (
                    <FieldRow
                      key={f}
                      field={f}
                      state={fields[f]}
                      disabled={!storeListingEnabled}
                      onCheckedChange={(v) => updateField(f, { checked: v })}
                      onValueChange={(v) => updateField(f, { value: v })}
                    />
                  ))}
                </FieldSection>

                {/* App details section */}
                <FieldSection
                  title="App details"
                  checked={appDetailsEnabled}
                  onCheckedChange={setAppDetailsEnabled}
                  translating={appDetailsTranslating}
                >
                  {APP_DETAILS_TEXT_FIELDS.map((f) => (
                    <FieldRow
                      key={f}
                      field={f}
                      state={fields[f]}
                      disabled={!appDetailsEnabled}
                      onCheckedChange={(v) => updateField(f, { checked: v })}
                      onValueChange={(v) => updateField(f, { value: v })}
                    />
                  ))}
                  {APP_DETAILS_URL_FIELDS.map((f) => (
                    <FieldRow
                      key={f}
                      field={f}
                      state={fields[f]}
                      disabled={!appDetailsEnabled}
                      onCheckedChange={(v) => updateField(f, { checked: v })}
                      onValueChange={(v) => updateField(f, { value: v })}
                    />
                  ))}
                </FieldSection>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <Info size={14} />
                    {error}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t pt-4 mt-2">
          <div className="flex-1" />
          {aiConfigured && !loading && !translated && (
            <Button
              variant="outline"
              onClick={handleCreate}
              disabled={loading || saving || anyTranslating || (!storeListingEnabled && !appDetailsEnabled)}
            >
              {saving && !anyTranslating ? (
                <>
                  <Spinner className="size-3.5" />
                  Adding…
                </>
              ) : (
                "Add without translation"
              )}
            </Button>
          )}
          {aiConfigured && !loading ? (
            <Button
              onClick={translated ? handleCreate : handleTranslate}
              disabled={anyTranslating || saving || (!storeListingEnabled && !appDetailsEnabled)}
            >
              {anyTranslating ? (
                <>
                  <Spinner className="size-3.5" />
                  Translating…
                </>
              ) : saving ? (
                <>
                  <Spinner className="size-3.5" />
                  Adding…
                </>
              ) : translated ? (
                <>
                  <MagicWand className="size-4" />
                  Add translated locale
                </>
              ) : (
                <>
                  <MagicWand className="size-4" />
                  Translate with AI
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={loading || saving || anyTranslating || (!storeListingEnabled && !appDetailsEnabled)}
            >
              {saving ? (
                <>
                  <Spinner className="size-3.5" />
                  Adding…
                </>
              ) : (
                "Add locale"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldSection({
  title,
  checked,
  onCheckedChange,
  translating,
  defaultOpen = false,
  children,
}: {
  title: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  translating?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          onClick={(e) => e.stopPropagation()}
        />
        <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-sm">
          <CaretRight
            size={12}
            className={`text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="font-medium">{title}</span>
          {translating && <Spinner className="size-3" />}
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className={`space-y-3 py-2 pl-10 pr-2 ${checked ? "" : "opacity-40 pointer-events-none"}`}>
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FieldRow({
  field,
  state,
  disabled,
  onCheckedChange,
  onValueChange,
  hint,
}: {
  field: string;
  state: FieldState | undefined;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  onValueChange: (value: string) => void;
  hint?: string;
}) {
  if (!state) return null;
  const limit = FIELD_LIMITS[field];
  const multiLine = isMultiLine(field);
  const isUrl = !isTextField(field) && field !== "keywords";
  const dimmed = !state.checked;

  return (
    <div className={`space-y-1.5 ${dimmed ? "opacity-40" : ""}`}>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={state.checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          disabled={disabled}
        />
        <span className="text-xs font-medium">{FIELD_LABELS[field] ?? field}</span>
        {state.translating && <Spinner className="size-3" />}
        {hint && !state.translating && (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
      </div>
      {state.translating ? (
        <div className="ml-7 flex h-8 items-center justify-center rounded border bg-muted/40">
          <Spinner className="size-3" />
        </div>
      ) : multiLine ? (
        <Textarea
          value={state.value}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={disabled || dimmed}
          dir={isUrl ? "ltr" : undefined}
          placeholder={!state.value ? "Empty" : undefined}
          className="ml-7 text-sm min-h-[60px] max-h-[120px] resize-none overflow-y-auto"
          style={{ width: "calc(100% - 1.75rem)" }}
          rows={3}
        />
      ) : (
        <Input
          value={state.value}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={disabled || dimmed}
          dir={isUrl ? "ltr" : undefined}
          placeholder={!state.value ? "Empty" : undefined}
          className="ml-7 text-sm"
          style={{ width: "calc(100% - 1.75rem)" }}
        />
      )}
      {limit && !isUrl && !state.translating && !dimmed && (
        <div className="ml-7">
          <CharCount value={state.value} limit={limit} />
        </div>
      )}
    </div>
  );
}
