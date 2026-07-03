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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Archive, ArrowCounterClockwise, CalendarBlank, Plus, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useFormDirty } from "@/lib/form-dirty-context";
import { useSetBreadcrumbTitle } from "@/lib/breadcrumb-context";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { CharCount } from "@/components/char-count";
import { ErrorState } from "@/components/error-state";
import { FooterPortal } from "@/lib/footer-portal-context";
import { normalizeLocale } from "@/lib/asc/locale-names";
import type { AscNomination, NominationType } from "@/lib/asc/nominations";
import { useTranslations } from "@/lib/i18n/locale-context";

import {
  LIMITS,
  DEVICE_FAMILIES,
  type NominationFormData,
  makeEmptyForm,
} from "./_components/nomination-constants";
import { NominationChecklist, useNominationChecklistReady } from "./_components/nomination-checklist";
import { LocalePicker } from "./_components/locale-picker";
import { FillFromVersionButton } from "./_components/fill-from-version-button";
import { CopyNotesButton } from "./_components/copy-notes-button";
import { SubmitNominationDialog } from "./_components/submit-nomination-dialog";

// ── Helpers ──────────────────────────────────────────────────────────

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
  const t = useTranslations();
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
    isNew ? t("nominations.form.newTitle") : (nomination?.attributes.name ?? null),
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
        err instanceof Error ? err.message : t("nominations.toast.fetchFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [isNew, nominationId, setDirty, t]);

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
    if (!form.name.trim()) errors.push(t("nominations.validation.nameRequired"));
    if (form.name.length > LIMITS.name)
      errors.push(t("nominations.validation.nameLimit", { length: form.name.length, limit: LIMITS.name }));
    if (!form.description.trim()) errors.push(t("nominations.validation.descriptionRequired"));
    if (form.description.length > LIMITS.description)
      errors.push(t("nominations.validation.descriptionLimit", { length: form.description.length, limit: LIMITS.description }));
    if (form.notes.length > LIMITS.notes)
      errors.push(t("nominations.validation.notesLimit", { length: form.notes.length, limit: LIMITS.notes }));
    if (!form.publishStartDate) errors.push(t("nominations.validation.publishDateRequired"));
    if (form.relatedAppIds.length === 0) errors.push(t("nominations.validation.relatedAppsRequired"));
    setValidationErrors(errors);
  }, [form, setValidationErrors, t]);

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
          throw new Error(data.error ?? t("nominations.toast.createFailed"));
        }

        const { id: newId } = await res.json();
        toast.success(t("nominations.toast.savedDraft"));
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
          throw new Error(data.error ?? t("nominations.toast.updateFailed"));
        }

        toast.success(t("nominations.toast.updated"));
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
    t,
  ]);

  // ── Discard handler ────────────────────────────────────────────────

  useEffect(() => {
    registerDiscard(() => {
      setForm(isNew ? emptyForm : originalRef.current);
    });
  }, [registerDiscard, isNew, emptyForm]);

  // ── Field updaters ─────────────────────────────────────────────────

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

  // ── Submit handler ─────────────────────────────────────────────────

  async function handleSubmit() {
    setConfirmSubmitOpen(false);
    setSubmitting(true);
    try {
      // Save any pending changes first (existing drafts only – new
      // nominations go straight to create-with-submitted to avoid a
      // duplicate draft).
      if (!isNew && formDirtyFlag) await onSave();

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
          throw new Error(data.error ?? t("nominations.toast.submitFailed"));
        }
        toast.success(t("nominations.toast.submitted"));
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
          throw new Error(data.error ?? t("nominations.toast.submitFailed"));
        }
        toast.success(t("nominations.toast.submitted"));
        await fetchNomination();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("nominations.toast.submitError"));
    } finally {
      setSubmitting(false);
    }
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
          <h3 className="section-title">{t("nominations.form.name")}</h3>
          <CharCount value={form.name} limit={LIMITS.name} />
        </div>
        <Input
          value={form.name}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder={t("nominations.form.namePlaceholder")}
          className="text-sm"
          disabled={readOnly}
        />
      </section>

      {/* Type */}
      <section className="space-y-2">
        <h3 className="section-title">{t("nominations.form.type")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("nominations.form.typeHint")}
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
            <SelectItem value="APP_LAUNCH">{t("nominations.types.APP_LAUNCH")}</SelectItem>
            <SelectItem value="APP_ENHANCEMENTS">{t("nominations.types.APP_ENHANCEMENTS")}</SelectItem>
            <SelectItem value="NEW_CONTENT">{t("nominations.types.NEW_CONTENT")}</SelectItem>
          </SelectContent>
        </Select>
      </section>

      {/* Description */}
      <section className="space-y-2">
        <h3 className="section-title">{t("nominations.form.description")}</h3>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <Textarea
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder={t("nominations.form.descriptionPlaceholder")}
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
        <h3 className="section-title">{t("nominations.form.publishDate")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("nominations.form.publishDateHint")}
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
                : t("nominations.form.pickDate")}
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
        <h3 className="section-title">{t("nominations.form.relatedApps")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("nominations.form.relatedAppsHint")}
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
        <h3 className="section-title">{t("nominations.form.platforms")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("nominations.form.platformsHint")}
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
        <h3 className="section-title">{t("nominations.form.inAppEvents")}</h3>
        <div className="flex items-center gap-3">
          <Switch
            id="has-events"
            checked={form.hasInAppEvents}
            onCheckedChange={(v) => updateField("hasInAppEvents", v)}
            disabled={readOnly}
          />
          <Label htmlFor="has-events" className="text-sm">
            {t("nominations.form.inAppEventsHint")}
          </Label>
        </div>
      </section>

      {/* Supplemental materials */}
      <section className="space-y-2">
        <h3 className="section-title">{t("nominations.form.supplementalMaterials")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("nominations.form.supplementalMaterialsHint")}
        </p>
        <div className="space-y-2">
          {form.supplementalMaterialsUris.map((uri, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                dir="ltr"
                value={uri}
                onChange={(e) => updateSupplementalUri(i, e.target.value)}
                placeholder={t("common.urlPlaceholder")}
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
              {t("nominations.form.addLink")}
            </Button>
          )}
        </div>
      </section>

      {/* Helpful details (notes) */}
      <section className="space-y-2">
        <div className="flex items-center gap-1">
          <h3 className="section-title">{t("nominations.form.helpfulDetails")}</h3>
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
          {t("nominations.form.helpfulDetailsHint")}
        </p>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <Textarea
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder={t("nominations.form.notesPlaceholder")}
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
        <h3 className="section-title">{t("nominations.form.options")}</h3>
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
            {t("nominations.form.launchSelectMarkets")}
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
            {t("nominations.form.preOrderEnabled")}
          </Label>
        </div>
      </section>

      {/* Read-only metadata (existing nominations) */}
      {!isNew && nomination && (
        <section className="space-y-2 border-t pt-6 pb-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t("nominations.form.lastUpdated")}</p>
              <p className="text-sm font-medium">
                {formatDate(new Date(nomination.attributes.lastModifiedDate))}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t("nominations.form.nominationId")}</p>
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
                {t("nominations.form.submitNomination")}
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
                      throw new Error(data.error ?? t("nominations.archiveFailed"));
                    }
                    toast.success(t("nominations.archiveSuccess"));
                    await fetchNomination();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t("nominations.archiveFailed"));
                  } finally {
                    setArchiving(false);
                  }
                }}
              >
                {archiving ? <Spinner className="size-3.5 mr-1.5" /> : <Archive size={14} className="mr-1.5" />}
                {t("nominations.archive")}
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
                      throw new Error(data.error ?? t("nominations.toast.unarchiveFailed"));
                    }
                    toast.success(t("nominations.unarchiveSuccess"));
                    await fetchNomination();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t("nominations.toast.unarchiveFailed"));
                  } finally {
                    setArchiving(false);
                  }
                }}
              >
                {archiving ? <Spinner className="size-3.5 mr-1.5" /> : <ArrowCounterClockwise size={14} className="mr-1.5" />}
                {t("nominations.unarchive")}
              </Button>
            )}
          </div>
        </FooterPortal>
      )}

      {/* Submit confirmation */}
      <SubmitNominationDialog
        open={confirmSubmitOpen}
        onOpenChange={setConfirmSubmitOpen}
        onConfirm={handleSubmit}
      />
    </div>
  );
}
