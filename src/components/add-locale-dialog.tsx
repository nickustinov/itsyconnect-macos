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
import { CaretRight, Info } from "@phosphor-icons/react";
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
  const [screenshotsEnabled, setScreenshotsEnabled] = useState(false);

  // Per-field state
  const [fields, setFields] = useState<Record<string, FieldState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Existing localization IDs (if locale already exists in ASC)
  const existingIdsRef = useRef<{ version?: string; appInfo?: string }>({});

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
        if (res.ok) {
          const data = await res.json();
          updateField(field, { value: data.result, translating: false });
          return data.result as string;
        }
      } catch {
        // Fall through – keep base value
      }
      updateField(field, { translating: false });
      return undefined;
    },
    [locale, primaryLocale, appName, updateField],
  );

  // Generate keywords for the locale
  const generateKeywords = useCallback(
    async (description: string, subtitle: string, forbiddenWords: string[]) => {
      updateField("keywords", { translating: true });
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "fix-keywords",
            text: "",
            field: "keywords",
            locale,
            appName,
            subtitle: subtitle || undefined,
            description: description || undefined,
            charLimit: FIELD_LIMITS.keywords,
            forbiddenWords,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          updateField("keywords", { value: data.result, translating: false });
          return;
        }
      } catch {
        // Fall through
      }
      updateField("keywords", { translating: false });
    },
    [locale, appName, updateField],
  );

  // Fetch base data and start translations when dialog opens
  useEffect(() => {
    if (!open || initiatedRef.current) return;
    initiatedRef.current = true;

    setLoading(true);
    setError(null);

    async function init() {
      // Fetch base data from both sections in parallel
      const [versionRes, infoRes] = await Promise.all([
        fetch(`/api/apps/${appId}/versions/${versionId}/localizations?refresh`),
        fetch(`/api/apps/${appId}/info/${appInfoId}/localizations?refresh`),
      ]);

      if (!versionRes.ok || !infoRes.ok) {
        setError("Failed to load base locale data");
        setLoading(false);
        return;
      }

      const versionData = await versionRes.json();
      const infoData = await infoRes.json();

      // Find primary locale data + check if target locale already exists
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

      // Initialise all fields with base values
      const initial: Record<string, FieldState> = {};

      for (const f of [...STORE_LISTING_TEXT_FIELDS, ...STORE_LISTING_URL_FIELDS]) {
        initial[f] = {
          value: baseStoreListing[f],
          translating: false,
          checked: f !== "whatsNew" || !isFirstVersion,
        };
      }
      initial.keywords = {
        value: "",
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

      // If AI is not configured, keep base values (already set)
      if (!aiConfigured) return;

      // Collect other locales' keywords for the forbidden words list
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const otherKeywords = (versionLocalizations ?? [])
        .filter((l: any) => l.attributes.locale !== locale)
        .map((l: any) => (l.attributes.keywords ?? "") as string);
      /* eslint-enable @typescript-eslint/no-explicit-any */

      // Start translations in parallel for text fields
      // Track description + subtitle promises for keyword generation
      let descPromise: Promise<string | undefined> = Promise.resolve(undefined);
      let subtitlePromise: Promise<string | undefined> = Promise.resolve(undefined);

      for (const f of STORE_LISTING_TEXT_FIELDS) {
        if (f === "whatsNew" && isFirstVersion) continue;
        const base = baseStoreListing[f];
        if (base.trim()) {
          const p = translateField(f, base);
          if (f === "description") descPromise = p;
        }
      }

      for (const f of APP_DETAILS_TEXT_FIELDS) {
        const base = baseAppDetails[f];
        if (base.trim()) {
          const p = translateField(f, base);
          if (f === "subtitle") subtitlePromise = p;
        }
      }

      // Wait for description + subtitle translations, then generate keywords
      // Rebuild forbidden words with translated subtitle so its words are excluded
      Promise.all([descPromise, subtitlePromise]).then(
        ([translatedDesc, translatedSubtitle]) => {
          const finalSubtitle = translatedSubtitle ?? baseAppDetails.subtitle;
          const finalForbidden = buildForbiddenKeywords({
            appName,
            subtitle: finalSubtitle || undefined,
            otherLocaleKeywords: otherKeywords,
          });
          generateKeywords(
            translatedDesc ?? baseStoreListing.description,
            finalSubtitle,
            finalForbidden,
          );
        },
      );
    }

    init().catch(() => {
      setError("Failed to initialise");
      setLoading(false);
    });
  }, [
    open,
    appId,
    versionId,
    appInfoId,
    primaryLocale,
    aiConfigured,
    isFirstVersion,
    translateField,
    generateKeywords,
  ]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      initiatedRef.current = false;
      setFields({});
      setLoading(true);
      setError(null);
      setSaving(false);
      setStoreListingEnabled(true);
      setAppDetailsEnabled(true);
      setScreenshotsEnabled(false);
    }
  }, [open]);

  // Save – create localizations via API
  async function handleCreate() {
    setSaving(true);
    setError(null);

    try {
      const promises: Promise<void>[] = [];

      // Store listing localization
      if (storeListingEnabled) {
        const storeFields: Record<string, string> = {};
        for (const f of [...STORE_LISTING_TEXT_FIELDS, ...STORE_LISTING_URL_FIELDS, "keywords" as const]) {
          if (f === "whatsNew" && isFirstVersion) continue;
          const fs = fields[f];
          if (fs?.checked && fs.value.trim()) {
            storeFields[f] = fs.value;
          }
        }
        promises.push(
          fetch(`/api/apps/${appId}/versions/${versionId}/localizations`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              locales: { [locale]: storeFields },
              originalLocaleIds: existingIdsRef.current.version
                ? { [locale]: existingIdsRef.current.version }
                : {},
            }),
          }).then(async (res) => {
            const data = await res.json();
            if (data.errors?.length > 0) {
              throw new Error(data.errors[0].message);
            }
          }),
        );
      }

      // App details localization
      if (appDetailsEnabled) {
        const detailFields: Record<string, string> = {};
        for (const f of [...APP_DETAILS_TEXT_FIELDS, ...APP_DETAILS_URL_FIELDS]) {
          const fs = fields[f];
          if (fs?.checked && fs.value.trim()) {
            detailFields[f] = fs.value;
          }
        }
        promises.push(
          fetch(`/api/apps/${appId}/info/${appInfoId}/localizations`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              locales: { [locale]: detailFields },
              originalLocaleIds: existingIdsRef.current.appInfo
                ? { [locale]: existingIdsRef.current.appInfo }
                : {},
            }),
          }).then(async (res) => {
            const data = await res.json();
            if (data.errors?.length > 0) {
              throw new Error(data.errors[0].message);
            }
          }),
        );
      }

      // Screenshots – just create empty version localization if not already covered
      if (screenshotsEnabled && !storeListingEnabled) {
        promises.push(
          fetch(`/api/apps/${appId}/versions/${versionId}/localizations`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              locales: { [locale]: {} },
              originalLocaleIds: existingIdsRef.current.version
                ? { [locale]: existingIdsRef.current.version }
                : {},
            }),
          }).then(async (res) => {
            const data = await res.json();
            if (data.errors?.length > 0) {
              throw new Error(data.errors[0].message);
            }
          }),
        );
      }

      await Promise.all(promises);

      toast.success(`Added ${localeName(locale)}`);
      onOpenChange(false);
      onCreated();
    } catch (err) {
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
            {aiConfigured
              ? `Fields are being translated from ${localeName(primaryLocale)}. Review and uncheck any you don't want.`
              : `AI is not configured – fields are copied from ${localeName(primaryLocale)}. Configure AI in settings for automatic translation.`}
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
              <div className="space-y-6">
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
                    hint={aiConfigured ? "Generated for this locale" : undefined}
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

                {/* Screenshots section */}
                <FieldSection
                  title="Screenshots"
                  checked={screenshotsEnabled}
                  onCheckedChange={setScreenshotsEnabled}
                  defaultOpen={false}
                >
                  <p className="text-sm text-muted-foreground">
                    Creates an empty locale for screenshots. Add screenshots manually after.
                  </p>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={loading || saving || anyTranslating || (!storeListingEnabled && !appDetailsEnabled && !screenshotsEnabled)}
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
