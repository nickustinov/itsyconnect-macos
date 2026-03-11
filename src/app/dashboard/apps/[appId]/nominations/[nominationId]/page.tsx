"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Archive, ArrowCounterClockwise, CalendarBlank, CheckCircle, Circle, MagicWand, Plus, Trash } from "@phosphor-icons/react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { toast } from "sonner";
import { useFormDirty } from "@/lib/form-dirty-context";
import { useSetBreadcrumbTitle } from "@/lib/breadcrumb-context";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { CharCount } from "@/components/char-count";
import { ErrorState } from "@/components/error-state";
import { FooterPortal } from "@/lib/footer-portal-context";
import { AIRequiredDialog } from "@/components/ai-required-dialog";
import { useAIStatus } from "@/lib/hooks/use-ai-status";
import { LOCALE_NAMES, localeName, normalizeLocale } from "@/lib/asc/locale-names";
import {
  stateLabel,
  STATE_DOT_COLORS,
  PLATFORM_LABELS,
  type AscVersion,
} from "@/lib/asc/version-types";
import type { AscLocalization } from "@/lib/asc/localizations";
import type {
  AscNomination,
  NominationType,
} from "@/lib/asc/nominations";

const SORTED_LOCALES = Object.keys(LOCALE_NAMES).sort((a, b) =>
  localeName(a).localeCompare(localeName(b)),
);

// ── Constants ────────────────────────────────────────────────────────

const LIMITS = {
  name: 60,
  description: 1000,
  notes: 500,
};

const DEVICE_FAMILIES = [
  { value: "IPHONE", label: "iOS (iPhone)" },
  { value: "IPAD", label: "iOS (iPad)" },
  { value: "APPLE_WATCH", label: "watchOS" },
  { value: "MAC", label: "macOS" },
  { value: "APPLE_TV", label: "tvOS" },
  { value: "APPLE_VISION", label: "visionOS" },
];

// ── Nomination checklist ─────────────────────────────────────────────

function NominationChecklist({ form }: { form: NominationFormData }) {
  const items = [
    { label: "Name", ok: form.name.trim().length > 0 && form.name.length <= LIMITS.name },
    { label: "Description", ok: form.description.trim().length > 0 && form.description.length <= LIMITS.description },
    { label: "Publish date", ok: !!form.publishStartDate },
    { label: "Related apps", ok: form.relatedAppIds.length > 0 },
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

function useNominationChecklistReady(form: NominationFormData): boolean {
  return (
    form.name.trim().length > 0 &&
    form.name.length <= LIMITS.name &&
    form.description.trim().length > 0 &&
    form.description.length <= LIMITS.description &&
    !!form.publishStartDate &&
    form.relatedAppIds.length > 0
  );
}

// ── Locale picker ────────────────────────────────────────────────────

function LocalePicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (locales: string[]) => void;
  disabled?: boolean;
}) {
  const anchor = useComboboxAnchor();

  return (
    <section className="space-y-2">
      <h3 className="section-title">Localization</h3>
      <Combobox
        multiple
        autoHighlight
        items={SORTED_LOCALES}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        itemToStringValue={(code: string) =>
          `${localeName(code)} ${code}`
        }
      >
        <ComboboxChips ref={anchor} className="w-full max-w-md">
          <ComboboxValue>
            {(selected: string[]) =>
              selected.map((code) => (
                <ComboboxChip key={code}>
                  {localeName(code)}
                </ComboboxChip>
              ))
            }
          </ComboboxValue>
          <ComboboxChipsInput />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>No languages found.</ComboboxEmpty>
          <ComboboxList>
            {(code: string) => (
              <ComboboxItem key={code} value={code}>
                {localeName(code)}
                <span className="ml-1.5 text-muted-foreground">{code}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </section>
  );
}

// ── Platform → device family mapping ─────────────────────────────────

const PLATFORM_TO_FAMILIES: Record<string, string[]> = {
  IOS: ["IPHONE", "IPAD"],
  MAC_OS: ["MAC"],
  TV_OS: ["APPLE_TV"],
  VISION_OS: ["APPLE_VISION"],
};

function threeWeeksFromNow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 21);
  d.setHours(12, 0, 0, 0);
  return d;
}

// ── Fill from version button ─────────────────────────────────────────

function FillFromVersionButton({
  versions,
  appId,
  appName,
  primaryLocale,
  onFill,
  disabled,
}: {
  versions: AscVersion[];
  appId: string;
  appName: string;
  primaryLocale: string;
  onFill: (data: Partial<NominationFormData>) => void;
  disabled?: boolean;
}) {
  const { configured } = useAIStatus();
  const [open, setOpen] = useState(false);
  const [filling, setFilling] = useState(false);
  const [showAIRequired, setShowAIRequired] = useState(false);

  async function handlePick(version: AscVersion) {
    if (!configured) {
      setOpen(false);
      setShowAIRequired(true);
      return;
    }

    setOpen(false);
    setFilling(true);
    try {
      // Fetch localizations for this version
      const res = await fetch(
        `/api/apps/${appId}/versions/${version.id}/localizations`,
      );
      let localizations: AscLocalization[] = [];
      if (res.ok) {
        const data = await res.json();
        localizations = data.localizations ?? [];
      }

      // Find primary locale's localization
      const primaryLoc = localizations.find(
        (l) => l.attributes.locale === primaryLocale,
      );
      const whatsNew = primaryLoc?.attributes.whatsNew ?? "";
      const promoText = primaryLoc?.attributes.promotionalText ?? "";
      const description = primaryLoc?.attributes.description ?? "";

      // Determine type: version 1.0.x → launch, else enhancements
      const isLaunch = /^1\.0(\.0)?$/.test(version.attributes.versionString);
      const type: NominationType = isLaunch
        ? "APP_LAUNCH"
        : "APP_ENHANCEMENTS";

      // Map platform → device families
      const families = PLATFORM_TO_FAMILIES[version.attributes.platform] ?? [];

      // Collect all locales from localizations
      const locales = localizations.map((l) =>
        normalizeLocale(l.attributes.locale),
      );

      // Publish date: earliest release date or 3 weeks from now
      let publishDate: Date;
      if (version.attributes.earliestReleaseDate) {
        publishDate = new Date(version.attributes.earliestReleaseDate);
      } else {
        publishDate = threeWeeksFromNow();
      }
      publishDate.setHours(12, 0, 0, 0);

      // Use AI to draft name + description
      let aiName = "";
      let aiDescription = "";
      const aiRes = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft-nomination",
          text: "",
          appName,
          versionString: version.attributes.versionString,
          whatsNew,
          promotionalText: promoText,
          description,
          isLaunch,
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const result = (aiData.result as string) ?? "";
        const newlineIdx = result.indexOf("\n");
        if (newlineIdx > 0) {
          aiName = result.slice(0, newlineIdx).trim();
          aiDescription = result.slice(newlineIdx + 1).trim();
        } else {
          aiDescription = result.trim();
        }
      }

      // Fallback if AI didn't produce useful output
      if (!aiName) {
        aiName = isLaunch
          ? `${appName} launch`
          : `${appName} ${version.attributes.versionString} update`;
      }
      if (!aiDescription) {
        const parts = [whatsNew, promoText].filter(Boolean);
        aiDescription = parts.length > 0 ? parts.join("\n\n") : description;
      }

      // Collect marketing URL for supplemental materials
      const marketingUrl = primaryLoc?.attributes.marketingUrl ?? "";
      const supplementalUris = marketingUrl ? [marketingUrl] : undefined;

      onFill({
        name: aiName.slice(0, LIMITS.name),
        description: aiDescription.slice(0, LIMITS.description),
        type,
        publishStartDate: publishDate,
        deviceFamilies: families,
        locales: locales.length > 0 ? locales : undefined,
        supplementalMaterialsUris: supplementalUris,
      });

      toast.success(`Filled from version ${version.attributes.versionString}`);
    } catch {
      toast.error("Failed to generate nomination");
    } finally {
      setFilling(false);
    }
  }

  if (versions.length === 0) return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={disabled || filling}
          >
            {filling ? (
              <Spinner className="size-3.5" />
            ) : (
              <MagicWand size={14} />
            )}
            Fill from version
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandEmpty>No versions found.</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {versions.map((v) => (
                  <CommandItem
                    key={v.id}
                    value={`${v.attributes.versionString} ${stateLabel(v.attributes.appVersionState)} ${PLATFORM_LABELS[v.attributes.platform] ?? v.attributes.platform}`}
                    onSelect={() => handlePick(v)}
                  >
                    <span className="font-mono">
                      {v.attributes.versionString}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="text-xs">
                        {PLATFORM_LABELS[v.attributes.platform] ?? v.attributes.platform}
                      </span>
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${STATE_DOT_COLORS[v.attributes.appVersionState] ?? "bg-muted-foreground"}`}
                      />
                      {stateLabel(v.attributes.appVersionState)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <AIRequiredDialog open={showAIRequired} onOpenChange={setShowAIRequired} />
    </>
  );
}

// ── Copy notes from previous nomination ──────────────────────────────

function CopyNotesButton({
  appId,
  currentNominationId,
  onCopy,
  disabled,
}: {
  appId: string;
  currentNominationId: string;
  onCopy: (notes: string) => void;
  disabled?: boolean;
}) {
  const [nominations, setNominations] = useState<AscNomination[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function handleOpen(open: boolean) {
    if (!open || loaded) return;
    try {
      const res = await fetch("/api/nominations");
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.nominations as AscNomination[]).filter(
          (n) =>
            n.relatedAppIds.includes(appId) &&
            n.id !== currentNominationId &&
            n.attributes.notes?.trim(),
        );
        setNominations(filtered);
      }
    } catch {
      // silently fail
    } finally {
      setLoaded(true);
    }
  }

  return (
    <DropdownMenu onOpenChange={handleOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground"
          disabled={disabled}
        >
          <MagicWand size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Copy from</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {!loaded ? (
              <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
            ) : nominations.length === 0 ? (
              <DropdownMenuItem disabled>No previous notes</DropdownMenuItem>
            ) : (
              nominations.map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  onSelect={() => onCopy(n.attributes.notes!)}
                >
                  {n.attributes.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Form state ───────────────────────────────────────────────────────

interface NominationFormData {
  name: string;
  description: string;
  notes: string;
  type: NominationType;
  publishStartDate: Date | undefined;
  deviceFamilies: string[];
  locales: string[];
  hasInAppEvents: boolean;
  launchInSelectMarketsFirst: boolean;
  preOrderEnabled: boolean;
  supplementalMaterialsUris: string[];
  relatedAppIds: string[];
}

function makeEmptyForm(appId: string, primaryLocale: string): NominationFormData {
  return {
    name: "",
    description: "",
    notes: "",
    type: "APP_ENHANCEMENTS",
    publishStartDate: undefined,
    deviceFamilies: [],
    locales: primaryLocale ? [primaryLocale] : [],
    hasInAppEvents: false,
    launchInSelectMarketsFirst: false,
    preOrderEnabled: false,
    supplementalMaterialsUris: [],
    relatedAppIds: [appId],
  };
}

function nominationToForm(n: AscNomination): NominationFormData {
  return {
    name: n.attributes.name,
    description: n.attributes.description,
    notes: n.attributes.notes ?? "",
    type: n.attributes.type,
    publishStartDate: n.attributes.publishStartDate
      ? new Date(n.attributes.publishStartDate)
      : undefined,
    deviceFamilies: n.attributes.deviceFamilies ?? [],
    locales: (n.attributes.locales ?? []).map(normalizeLocale),
    hasInAppEvents: n.attributes.hasInAppEvents ?? false,
    launchInSelectMarketsFirst:
      n.attributes.launchInSelectMarketsFirst ?? false,
    preOrderEnabled: n.attributes.preOrderEnabled ?? false,
    supplementalMaterialsUris:
      n.attributes.supplementalMaterialsUris ?? [],
    relatedAppIds: n.relatedAppIds,
  };
}

function formsEqual(a: NominationFormData, b: NominationFormData): boolean {
  return (
    a.name === b.name &&
    a.description === b.description &&
    a.notes === b.notes &&
    a.type === b.type &&
    a.publishStartDate?.getTime() === b.publishStartDate?.getTime() &&
    a.hasInAppEvents === b.hasInAppEvents &&
    a.launchInSelectMarketsFirst === b.launchInSelectMarketsFirst &&
    a.preOrderEnabled === b.preOrderEnabled &&
    JSON.stringify(a.deviceFamilies) === JSON.stringify(b.deviceFamilies) &&
    JSON.stringify(a.locales) === JSON.stringify(b.locales) &&
    JSON.stringify(a.supplementalMaterialsUris) ===
      JSON.stringify(b.supplementalMaterialsUris) &&
    JSON.stringify(a.relatedAppIds) === JSON.stringify(b.relatedAppIds)
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Page ─────────────────────────────────────────────────────────────

export default function NominationDetailPage() {
  const { appId, nominationId } = useParams<{
    appId: string;
    nominationId: string;
  }>();
  const router = useRouter();
  const isNew = nominationId === "new";
  const { apps } = useApps();
  const { versions } = useVersions();
  const app = apps.find((a) => a.id === appId);
  const primaryLocale = app?.primaryLocale ?? "";

  const {
    isDirty: formDirtyFlag,
    isSaving,
    setDirty,
    registerSave,
    registerDiscard,
    setValidationErrors,
    onSave,
  } = useFormDirty();

  // Data
  const [nomination, setNomination] = useState<AscNomination | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);

  // Form
  const emptyForm = useMemo(() => makeEmptyForm(appId, primaryLocale), [appId, primaryLocale]);
  const [form, setForm] = useState<NominationFormData>(emptyForm);
  const originalRef = useRef<NominationFormData>(emptyForm);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const checklistReady = useNominationChecklistReady(form);

  // Archive / unarchive
  const [archiving, setArchiving] = useState(false);

  // Breadcrumb
  useSetBreadcrumbTitle(
    isNew ? "New nomination" : (nomination?.attributes.name ?? null),
  );

  // ── Fetch existing nomination ──────────────────────────────────────

  const fetchNomination = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/nominations/${nominationId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error ?? `Failed to fetch nomination (${res.status})`,
        );
      }
      const data = await res.json();
      setNomination(data.nomination);
      const formData = nominationToForm(data.nomination);
      setForm(formData);
      originalRef.current = formData;
      setDirty(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch nomination",
      );
    } finally {
      setLoading(false);
    }
  }, [isNew, nominationId, setDirty]);

  useEffect(() => {
    fetchNomination();
  }, [fetchNomination]);

  // Pre-select primary locale once app data loads (for new nominations)
  useEffect(() => {
    if (isNew && primaryLocale && form.locales.length === 0) {
      setForm((f) => ({ ...f, locales: [primaryLocale] }));
    }
  }, [isNew, primaryLocale]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dirty tracking ─────────────────────────────────────────────────

  const isDirty = useMemo(() => {
    if (isNew) return !formsEqual(form, emptyForm);
    return !formsEqual(form, originalRef.current);
  }, [form, isNew, emptyForm]);

  useEffect(() => {
    setDirty(isDirty);
  }, [isDirty, setDirty]);

  // ── Validation ─────────────────────────────────────────────────────

  useEffect(() => {
    const errors: string[] = [];
    if (!form.name.trim()) errors.push("Name is required");
    if (form.name.length > LIMITS.name)
      errors.push(`Name (${form.name.length}/${LIMITS.name})`);
    if (!form.description.trim()) errors.push("Description is required");
    if (form.description.length > LIMITS.description)
      errors.push(`Description (${form.description.length}/${LIMITS.description})`);
    if (form.notes.length > LIMITS.notes)
      errors.push(`Notes (${form.notes.length}/${LIMITS.notes})`);
    if (!form.publishStartDate) errors.push("Publish date is required");
    if (form.relatedAppIds.length === 0) errors.push("At least one related app is required");
    setValidationErrors(errors);
  }, [form, setValidationErrors]);

  // ── Save handler ───────────────────────────────────────────────────

  useEffect(() => {
    registerSave(async () => {
      if (isNew) {
        const res = await fetch("/api/nominations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            name: form.name.trim(),
            description: form.description.trim(),
            ...(form.notes.trim() && { notes: form.notes.trim() }),
            type: form.type,
            publishStartDate: form.publishStartDate!.toISOString(),
            ...(form.deviceFamilies.length > 0 && {
              deviceFamilies: form.deviceFamilies,
            }),
            ...(form.locales.length > 0 && { locales: form.locales }),
            hasInAppEvents: form.hasInAppEvents,
            launchInSelectMarketsFirst: form.launchInSelectMarketsFirst,
            preOrderEnabled: form.preOrderEnabled,
            ...(form.supplementalMaterialsUris.length > 0 && {
              supplementalMaterialsUris: form.supplementalMaterialsUris.filter(
                (u) => u.trim(),
              ),
            }),
            submitted: false,
            relatedAppIds: form.relatedAppIds,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to create nomination");
        }

        const { id: newId } = await res.json();
        toast.success("Nomination saved as draft");
        setDirty(false);
        router.replace(`/dashboard/apps/${appId}/nominations/${newId}`);
      } else {
        const res = await fetch("/api/nominations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            id: nominationId,
            attributes: {
              name: form.name.trim(),
              description: form.description.trim(),
              notes: form.notes.trim() || null,
              type: form.type,
              publishStartDate: form.publishStartDate!.toISOString(),
              deviceFamilies:
                form.deviceFamilies.length > 0
                  ? form.deviceFamilies
                  : null,
              locales: form.locales.length > 0 ? form.locales : null,
              hasInAppEvents: form.hasInAppEvents,
              launchInSelectMarketsFirst: form.launchInSelectMarketsFirst,
              preOrderEnabled: form.preOrderEnabled,
              supplementalMaterialsUris:
                form.supplementalMaterialsUris.filter((u) => u.trim())
                  .length > 0
                  ? form.supplementalMaterialsUris.filter((u) => u.trim())
                  : null,
              submitted: false,
            },
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to update nomination");
        }

        toast.success("Nomination updated");
        originalRef.current = { ...form };
        setDirty(false);
      }
    });
  }, [
    registerSave,
    isNew,
    form,
    appId,
    nominationId,
    router,
    setDirty,
  ]);

  // ── Discard handler ────────────────────────────────────────────────

  useEffect(() => {
    registerDiscard(() => {
      setForm(isNew ? emptyForm : originalRef.current);
    });
  }, [registerDiscard, isNew, emptyForm]);

  // ── Field updater ──────────────────────────────────────────────────

  function updateField<K extends keyof NominationFormData>(
    key: K,
    value: NominationFormData[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleDeviceFamily(family: string) {
    setForm((f) => ({
      ...f,
      deviceFamilies: f.deviceFamilies.includes(family)
        ? f.deviceFamilies.filter((d) => d !== family)
        : [...f.deviceFamilies, family],
    }));
  }

  function toggleRelatedApp(id: string) {
    setForm((f) => ({
      ...f,
      relatedAppIds: f.relatedAppIds.includes(id)
        ? f.relatedAppIds.filter((a) => a !== id)
        : [...f.relatedAppIds, id],
    }));
  }

  function updateSupplementalUri(index: number, value: string) {
    setForm((f) => {
      const uris = [...f.supplementalMaterialsUris];
      uris[index] = value;
      return { ...f, supplementalMaterialsUris: uris };
    });
  }

  function addSupplementalUri() {
    setForm((f) => ({
      ...f,
      supplementalMaterialsUris: [...f.supplementalMaterialsUris, ""],
    }));
  }

  function removeSupplementalUri(index: number) {
    setForm((f) => ({
      ...f,
      supplementalMaterialsUris: f.supplementalMaterialsUris.filter(
        (_, i) => i !== index,
      ),
    }));
  }

  // ── Render ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchNomination} />;
  }

  const readOnly = !isNew && nomination?.attributes.state !== "DRAFT";

  function handleFillFromVersion(data: Partial<NominationFormData>) {
    setForm((f) => ({
      ...f,
      ...data,
      // Merge device families (don't lose existing selections)
      deviceFamilies: data.deviceFamilies
        ? [...new Set([...f.deviceFamilies, ...data.deviceFamilies])]
        : f.deviceFamilies,
      // Merge locales (don't lose existing selections)
      locales: data.locales
        ? [...new Set([...f.locales, ...data.locales])]
        : f.locales,
      // Merge supplemental URIs (don't duplicate)
      supplementalMaterialsUris: data.supplementalMaterialsUris
        ? [...new Set([...f.supplementalMaterialsUris, ...data.supplementalMaterialsUris].filter(Boolean))]
        : f.supplementalMaterialsUris,
    }));
  }

  return (
    <div className="space-y-8">
      {/* ── Fill from version ──────────────────────────────────────── */}
      {!readOnly && (
        <FillFromVersionButton
          versions={versions}
          appId={appId}
          appName={app?.name ?? ""}
          primaryLocale={primaryLocale}
          onFill={handleFillFromVersion}
        />
      )}

      {/* ── Nomination details ─────────────────────────────────────── */}

      {/* Name */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="section-title">Name</h3>
          <CharCount value={form.name} limit={LIMITS.name} />
        </div>
        <Input
          value={form.name}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder="A memorable name to help you recognise this nomination later"
          className="text-sm"
          disabled={readOnly}
        />
      </section>

      {/* Type */}
      <section className="space-y-2">
        <h3 className="section-title">Type</h3>
        <p className="text-sm text-muted-foreground">
          The type of nomination you&apos;re submitting.
        </p>
        <Select
          value={form.type}
          onValueChange={(v) => updateField("type", v as NominationType)}
          disabled={readOnly}
        >
          <SelectTrigger className="w-[280px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="APP_LAUNCH">App launch</SelectItem>
            <SelectItem value="APP_ENHANCEMENTS">App enhancements</SelectItem>
            <SelectItem value="NEW_CONTENT">New content</SelectItem>
          </SelectContent>
        </Select>
      </section>

      {/* Description */}
      <section className="space-y-2">
        <h3 className="section-title">Description</h3>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <Textarea
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="A detailed description of your nomination."
              className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none text-sm min-h-0 dark:bg-transparent"
              disabled={readOnly}
            />
          </CardContent>
          <div className="flex items-center rounded-b-xl border-t bg-sidebar px-3 py-1.5">
            <CharCount value={form.description} limit={LIMITS.description} />
          </div>
        </Card>
      </section>

      {/* Publish date */}
      <section className="space-y-2">
        <h3 className="section-title">Publish date</h3>
        <p className="text-sm text-muted-foreground">
          The date or time frame when you expect to publish on the App Store.
        </p>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              disabled={readOnly}
              className="justify-start gap-2 font-normal"
            >
              <CalendarBlank size={16} className="text-muted-foreground" />
              {form.publishStartDate
                ? formatDate(form.publishStartDate)
                : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={form.publishStartDate}
              onSelect={(date) => {
                if (!date) return;
                date.setHours(12, 0, 0, 0);
                updateField("publishStartDate", date);
              }}
              disabled={(date) =>
                date < new Date(new Date().setHours(0, 0, 0, 0))
              }
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </section>

      {/* ── Additional information ─────────────────────────────────── */}

      {/* Related apps */}
      <section className="space-y-2">
        <h3 className="section-title">Related apps</h3>
        <p className="text-sm text-muted-foreground">
          Choose all apps related to this nomination.
        </p>
        <div className="space-y-2">
          {apps.map((app) => (
            <div key={app.id} className="flex items-center gap-3">
              <Checkbox
                id={`app-${app.id}`}
                checked={form.relatedAppIds.includes(app.id)}
                onCheckedChange={() => toggleRelatedApp(app.id)}
                disabled={readOnly}
              />
              <Label htmlFor={`app-${app.id}`} className="text-sm">
                {app.name}
              </Label>
            </div>
          ))}
        </div>
      </section>

      {/* Platforms */}
      <section className="space-y-2">
        <h3 className="section-title">Platforms</h3>
        <p className="text-sm text-muted-foreground">
          Select all platforms associated with this nomination.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          {DEVICE_FAMILIES.map((df) => (
            <div key={df.value} className="flex items-center gap-2">
              <Checkbox
                id={`df-${df.value}`}
                checked={form.deviceFamilies.includes(df.value)}
                onCheckedChange={() => toggleDeviceFamily(df.value)}
                disabled={readOnly}
              />
              <Label htmlFor={`df-${df.value}`} className="text-sm">
                {df.label}
              </Label>
            </div>
          ))}
        </div>
      </section>

      {/* Localization */}
      <LocalePicker
        value={form.locales}
        onChange={(locales) => updateField("locales", locales)}
        disabled={readOnly}
      />

      {/* In-app events */}
      <section className="space-y-4">
        <h3 className="section-title">In-app events</h3>
        <div className="flex items-center gap-3">
          <Switch
            id="has-events"
            checked={form.hasInAppEvents}
            onCheckedChange={(v) => updateField("hasInAppEvents", v)}
            disabled={readOnly}
          />
          <Label htmlFor="has-events" className="text-sm">
            Submit a new in-app event for this nomination
          </Label>
        </div>
      </section>

      {/* Supplemental materials */}
      <section className="space-y-2">
        <h3 className="section-title">Supplemental materials</h3>
        <p className="text-sm text-muted-foreground">
          Links to any additional material you&apos;d like to include.
        </p>
        <div className="space-y-2">
          {form.supplementalMaterialsUris.map((uri, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                dir="ltr"
                value={uri}
                onChange={(e) => updateSupplementalUri(i, e.target.value)}
                placeholder="https://..."
                className="text-sm"
                disabled={readOnly}
              />
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeSupplementalUri(i)}
                >
                  <Trash size={14} />
                </Button>
              )}
            </div>
          ))}
          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={addSupplementalUri}
            >
              <Plus size={14} />
              Add link
            </Button>
          )}
        </div>
      </section>

      {/* Helpful details (notes) */}
      <section className="space-y-2">
        <div className="flex items-center gap-1">
          <h3 className="section-title">Helpful details</h3>
          {!readOnly && (
            <CopyNotesButton
              appId={appId}
              currentNominationId={nominationId}
              onCopy={(notes) => updateField("notes", notes)}
              disabled={readOnly}
            />
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          What makes you stand out from the crowd? Tell us about your unique
          approach or behind-the-scenes story.
        </p>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <Textarea
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Additional context for Apple's editorial team…"
              className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none text-sm min-h-0 dark:bg-transparent"
              disabled={readOnly}
            />
          </CardContent>
          <div className="flex items-center rounded-b-xl border-t bg-sidebar px-3 py-1.5">
            <CharCount value={form.notes} limit={LIMITS.notes} />
          </div>
        </Card>
      </section>

      {/* Options */}
      <section className="space-y-4">
        <h3 className="section-title">Options</h3>
        <div className="flex items-center gap-3">
          <Switch
            id="select-markets"
            checked={form.launchInSelectMarketsFirst}
            onCheckedChange={(v) =>
              updateField("launchInSelectMarketsFirst", v)
            }
            disabled={readOnly}
          />
          <Label htmlFor="select-markets" className="text-sm">
            Launch in select markets first
          </Label>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="pre-order"
            checked={form.preOrderEnabled}
            onCheckedChange={(v) => updateField("preOrderEnabled", v)}
            disabled={readOnly}
          />
          <Label htmlFor="pre-order" className="text-sm">
            Pre-order enabled
          </Label>
        </div>
      </section>

      {/* Read-only metadata (existing nominations) */}
      {!isNew && nomination && (
        <section className="space-y-2 border-t pt-6 pb-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Last updated</p>
              <p className="text-sm font-medium">
                {formatDate(new Date(nomination.attributes.lastModifiedDate))}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Nomination ID</p>
              <p className="text-sm font-medium font-mono">{nomination.id}</p>
            </div>
          </div>
        </section>
      )}

      {/* ── Submit footer ──────────────────────────────────────────── */}
      {!readOnly && (
        <FooterPortal>
          <div className="flex shrink-0 items-center justify-between gap-4 border-t bg-sidebar px-6 py-3">
            <div className="min-w-0 flex-1">
              <NominationChecklist form={form} />
            </div>
            <div className="shrink-0">
              <Button
                disabled={!checklistReady || submitting || isSaving}
                onClick={() => setConfirmSubmitOpen(true)}
              >
                {submitting && <Spinner className="size-3.5 mr-1.5" />}
                Submit nomination
              </Button>
            </div>
          </div>
        </FooterPortal>
      )}

      {/* ── Archive / unarchive footer ─────────────────────────────── */}
      {!isNew && (nomination?.attributes.state === "SUBMITTED" || nomination?.attributes.state === "ARCHIVED") && (
        <FooterPortal>
          <div className="flex shrink-0 items-center justify-end gap-4 border-t bg-sidebar px-6 py-3">
            {nomination.attributes.state === "SUBMITTED" ? (
              <Button
                variant="outline"
                disabled={archiving}
                onClick={async () => {
                  setArchiving(true);
                  try {
                    const res = await fetch("/api/nominations", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "update",
                        id: nominationId,
                        attributes: { archived: true },
                      }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error ?? "Failed to archive nomination");
                    }
                    toast.success("Nomination archived");
                    await fetchNomination();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to archive");
                  } finally {
                    setArchiving(false);
                  }
                }}
              >
                {archiving ? <Spinner className="size-3.5 mr-1.5" /> : <Archive size={14} className="mr-1.5" />}
                Archive
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={archiving}
                onClick={async () => {
                  setArchiving(true);
                  try {
                    const res = await fetch("/api/nominations", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "update",
                        id: nominationId,
                        attributes: { archived: false },
                      }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error ?? "Failed to unarchive nomination");
                    }
                    toast.success("Nomination unarchived");
                    await fetchNomination();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to unarchive");
                  } finally {
                    setArchiving(false);
                  }
                }}
              >
                {archiving ? <Spinner className="size-3.5 mr-1.5" /> : <ArrowCounterClockwise size={14} className="mr-1.5" />}
                Unarchive
              </Button>
            )}
          </div>
        </FooterPortal>
      )}

      {/* Submit confirmation */}
      <AlertDialog open={confirmSubmitOpen} onOpenChange={(open) => !open && setConfirmSubmitOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit nomination?</AlertDialogTitle>
            <AlertDialogDescription>
              Your nomination will be submitted to Apple&apos;s editorial team for review.
              You can still edit most fields after submission, but the type and related apps cannot be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmSubmitOpen(false);
                setSubmitting(true);
                try {
                  // Save any pending changes first
                  if (formDirtyFlag) await onSave();

                  if (isNew) {
                    // For new: create with submitted: true
                    const res = await fetch("/api/nominations", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "create",
                        name: form.name.trim(),
                        description: form.description.trim(),
                        ...(form.notes.trim() && { notes: form.notes.trim() }),
                        type: form.type,
                        publishStartDate: form.publishStartDate!.toISOString(),
                        ...(form.deviceFamilies.length > 0 && {
                          deviceFamilies: form.deviceFamilies,
                        }),
                        ...(form.locales.length > 0 && { locales: form.locales }),
                        hasInAppEvents: form.hasInAppEvents,
                        launchInSelectMarketsFirst: form.launchInSelectMarketsFirst,
                        preOrderEnabled: form.preOrderEnabled,
                        ...(form.supplementalMaterialsUris.filter((u) => u.trim()).length > 0 && {
                          supplementalMaterialsUris: form.supplementalMaterialsUris.filter((u) => u.trim()),
                        }),
                        submitted: true,
                        relatedAppIds: form.relatedAppIds,
                      }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error ?? "Failed to submit nomination");
                    }
                    toast.success("Nomination submitted");
                    setDirty(false);
                    router.push(`/dashboard/apps/${appId}/nominations`);
                  } else {
                    // For existing draft: patch submitted: true
                    const res = await fetch("/api/nominations", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "update",
                        id: nominationId,
                        attributes: { submitted: true },
                      }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error ?? "Failed to submit nomination");
                    }
                    toast.success("Nomination submitted");
                    await fetchNomination();
                  }
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to submit");
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
