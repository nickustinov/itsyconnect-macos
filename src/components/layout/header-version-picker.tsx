"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useParams,
  usePathname,
  useSearchParams,
  useRouter,
} from "next/navigation";
import { ArrowsClockwise, CaretDown, Check, Plus } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { usePreReleaseVersions } from "@/lib/pre-release-versions-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import { useChangeBuffer } from "@/lib/change-buffer-context";
import { useReviewChanges } from "@/lib/review-changes-context";
import { useRefresh } from "@/lib/refresh-context";
import { localeName, sortLocales } from "@/lib/asc/locale-names";
import { useTranslations } from "@/lib/i18n/locale-context";
import { useReviewFieldLabel, useReviewSectionLabels } from "@/lib/i18n/use-review-field-labels";
import { useAscLabels } from "@/lib/i18n/use-asc-labels";
import {
  getVersionPlatforms,
  getVersionsByPlatform,
  resolveVersion,
  getPreReleasePlatforms,
  getPreReleasesByPlatform,
  resolvePreReleaseVersion,
  isValidVersionString,
  hasInvalidVersionChars,
  TEXT_EDITABLE_STATES,
  PLATFORM_LABELS,
  STATE_DOT_COLORS,
  type AscVersion,
} from "@/lib/asc/version-types";

const VERSION_PAGES = new Set(["store-listing", "screenshots", "review", "testflight", "aso"]);
const PLATFORM_ONLY_PAGES = new Set(["reviews"]);

const REVIEWS_PLATFORM_KEY = "reviews:platform:";
export const REVIEWS_PLATFORM_CHANGE = "reviews-platform-change";
export function readReviewsPlatform(appId: string): string | null {
  try { return localStorage.getItem(`${REVIEWS_PLATFORM_KEY}${appId}`); } catch { return null; }
}
function writeReviewsPlatform(appId: string, platform: string) {
  try { localStorage.setItem(`${REVIEWS_PLATFORM_KEY}${appId}`, platform); } catch {}
  window.dispatchEvent(new CustomEvent(REVIEWS_PLATFORM_CHANGE, { detail: platform }));
}
const SAVE_PAGES = new Set(["details", "store-listing", "review", "aso", "nominations"]);
const OVERVIEW_PAGE = "";

const LIVE_STATES = new Set([
  "READY_FOR_SALE",
  "READY_FOR_DISTRIBUTION",
  "ACCEPTED",
]);

/** All non-live versions + only the most recent live version. */
function filterPickerVersions(versions: AscVersion[]): AscVersion[] {
  let foundLive = false;
  return versions.filter((v) => {
    if (!LIVE_STATES.has(v.attributes.appVersionState)) return true;
    if (!foundLive) { foundLive = true; return true; }
    return false;
  });
}

export function HeaderVersionPicker() {
  const t = useTranslations();
  const { platformLabel, versionStateLabel } = useAscLabels();
  const { appId } = useParams<{ appId?: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { versions, refresh } = useVersions();
  const { versions: preReleaseVersions } = usePreReleaseVersions();
  const { guardNavigation } = useFormDirty();

  const [platformPickerOpen, setPlatformPickerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [versionString, setVersionString] = useState("");
  const [platform, setPlatform] = useState("");
  const [creating, setCreating] = useState(false);
  const [persistedPlatform, setPersistedPlatform] = useState(() =>
    appId ? readReviewsPlatform(appId) : null,
  );

  const subpath = appId
    ? pathname.replace(`/dashboard/apps/${appId}`, "").replace(/^\//, "")
    : "";
  const pageSegment = subpath.split("/")[0];

  const isTestFlight = subpath === "testflight" || /^testflight\/groups\/[^/]+$/.test(subpath);
  const isPlatformOnly = PLATFORM_ONLY_PAGES.has(pageSegment);

  const versionParam = searchParams.get("version");

  const platforms = isTestFlight
    ? getPreReleasePlatforms(preReleaseVersions)
    : getVersionPlatforms(versions);

  const selectedVersion = isTestFlight ? undefined : resolveVersion(versions, versionParam);
  const selectedPreRelease = isTestFlight ? resolvePreReleaseVersion(preReleaseVersions, versionParam) : undefined;

  const currentPlatform = isPlatformOnly
    ? (persistedPlatform && platforms.includes(persistedPlatform) ? persistedPlatform : platforms[0] ?? "IOS")
    : isTestFlight
      ? (selectedPreRelease?.platform ?? platforms[0] ?? "IOS")
      : (selectedVersion?.attributes.platform ?? platforms[0] ?? "IOS");

  // Seed localStorage so the reviews page reads the same default platform.
  useEffect(() => {
    if (isPlatformOnly && appId && currentPlatform && currentPlatform !== readReviewsPlatform(appId)) {
      writeReviewsPlatform(appId, currentPlatform);
      setPersistedPlatform(currentPlatform);
    }
  }, [isPlatformOnly, currentPlatform, appId]);

  if (!appId) return null;

  // Show on testflight root (builds list) and group detail pages
  if (!VERSION_PAGES.has(pageSegment) && !isTestFlight && !isPlatformOnly) return null;
  if (pageSegment === "testflight" && !isTestFlight) return null;

  // Hide "New version/platform" on pages that only browse versions
  const showCreateActions = !isTestFlight && !isPlatformOnly && pageSegment !== "aso";

  const platformVersions = isTestFlight
    ? getPreReleasesByPlatform(preReleaseVersions, currentPlatform)
    : filterPickerVersions(getVersionsByPlatform(versions, currentPlatform));

  function navigate(versionId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("version", versionId);
    const url = `${pathname}?${params.toString()}`;
    guardNavigation(() => router.replace(url));
  }

  function handlePlatformChange(newPlatform: string) {
    if (isPlatformOnly) {
      setPersistedPlatform(newPlatform);
      writeReviewsPlatform(appId!, newPlatform);
      return;
    }
    if (isTestFlight) {
      const pvs = getPreReleasesByPlatform(preReleaseVersions, newPlatform);
      if (pvs.length > 0) navigate(pvs[0].id);
    } else {
      const pvs = getVersionsByPlatform(versions, newPlatform);
      if (pvs.length > 0) navigate(pvs[0].id);
    }
  }

  function openDialog() {
    setVersionString("");
    setPlatform(currentPlatform);
    setDialogOpen(true);
  }

  const trimmedVersion = versionString.trim();
  const versionValid = trimmedVersion !== "" && isValidVersionString(trimmedVersion);

  async function handleCreate() {
    if (!versionValid || !platform) return;
    setCreating(true);
    try {
      const data = await apiFetch<{ versionId: string }>(`/api/apps/${appId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionString: trimmedVersion, platform }),
      });
      setDialogOpen(false);
      await refresh();
      router.push(`/dashboard/apps/${appId}/store-listing?version=${data.versionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("versionPicker.createVersionFailed"));
    } finally {
      setCreating(false);
    }
  }

  // Display values for the version trigger button
  const triggerVersionString = isTestFlight
    ? (selectedPreRelease?.version ?? "–")
    : (selectedVersion?.attributes.versionString ?? "–");
  const selectedId = isTestFlight ? selectedPreRelease?.id : selectedVersion?.id;

  return (
    <>
      <Separator orientation="vertical" className="mx-2 !h-4" />
      <Popover open={platformPickerOpen} onOpenChange={setPlatformPickerOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-8 gap-1.5 px-2.5 text-sm">
            {platformLabel(currentPlatform)}
            <CaretDown size={12} className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-0" align="start">
          <Command>
            <CommandList>
              <CommandGroup>
                {platforms.map((p) => (
                  <CommandItem
                    key={p}
                    value={platformLabel(p)}
                    onSelect={() => {
                      handlePlatformChange(p);
                      setPlatformPickerOpen(false);
                    }}
                  >
                    {p === currentPlatform && (
                      <Check size={14} className="text-foreground" />
                    )}
                    <span className={p !== currentPlatform ? "pl-[22px]" : ""}>
                      {platformLabel(p)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {showCreateActions && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        setPlatformPickerOpen(false);
                        guardNavigation(openDialog);
                      }}
                    >
                      <Plus size={14} className="text-muted-foreground" />
                      {t("versionPicker.newPlatform")}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {!isPlatformOnly && (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-8 gap-1.5 px-2.5 font-mono text-sm">
              {triggerVersionString}
              {!isTestFlight && selectedVersion && (
                <span
                  className={`size-1.5 shrink-0 rounded-full ${STATE_DOT_COLORS[selectedVersion.attributes.appVersionState] ?? "bg-muted-foreground"}`}
                />
              )}
              <CaretDown size={12} className="text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandList>
                <CommandEmpty>{t("versionPicker.noVersionsFound")}</CommandEmpty>
                <CommandGroup>
                  {isTestFlight
                    ? (platformVersions as ReturnType<typeof getPreReleasesByPlatform>).map((v) => (
                        <CommandItem
                          key={v.id}
                          value={v.version}
                          onSelect={() => {
                            navigate(v.id);
                            setPickerOpen(false);
                          }}
                        >
                          {v.id === selectedId && (
                            <Check size={14} className="text-foreground" />
                          )}
                          <span className={`font-mono ${v.id !== selectedId ? "pl-[22px]" : ""}`}>
                            {v.version}
                          </span>
                        </CommandItem>
                      ))
                    : (platformVersions as AscVersion[]).map((v) => (
                        <CommandItem
                          key={v.id}
                          value={`${v.attributes.versionString} ${versionStateLabel(v.attributes.appVersionState)}`}
                          onSelect={() => {
                            navigate(v.id);
                            setPickerOpen(false);
                          }}
                        >
                          {v.id === selectedId && (
                            <Check size={14} className="text-foreground" />
                          )}
                          <span className={`font-mono ${v.id !== selectedId ? "pl-[22px]" : ""}`}>
                            {v.attributes.versionString}
                          </span>
                          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span
                              className={`size-1.5 shrink-0 rounded-full ${STATE_DOT_COLORS[v.attributes.appVersionState] ?? "bg-muted-foreground"}`}
                            />
                            {versionStateLabel(v.attributes.appVersionState)}
                          </span>
                        </CommandItem>
                      ))}
                </CommandGroup>
                {showCreateActions && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          setPickerOpen(false);
                          guardNavigation(openDialog);
                        }}
                      >
                        <Plus size={14} className="text-muted-foreground" />
                        {t("versionPicker.newVersion")}
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {showCreateActions && (
        <CreateVersionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          versionString={versionString}
          onVersionStringChange={setVersionString}
          platform={platform}
          onPlatformChange={setPlatform}
          creating={creating}
          onSubmit={handleCreate}
        />
      )}
    </>
  );
}

export function HeaderVersionActions() {
  const t = useTranslations();
  const { appId } = useParams<{ appId?: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { versions, refresh } = useVersions();
  const { isDirty, isSaving, onSave, onDiscard, guardNavigation } = useFormDirty();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [versionString, setVersionString] = useState("");
  const [platform, setPlatform] = useState("");
  const [creating, setCreating] = useState(false);

  const platforms = getVersionPlatforms(versions);

  // Cmd+S / Ctrl+S to save
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && isDirty && !isSaving) {
        e.preventDefault();
        onSave();
      }
    },
    [isDirty, isSaving, onSave],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!appId) return null;

  const pageSegment = pathname
    .replace(`/dashboard/apps/${appId}`, "")
    .replace(/^\//, "")
    .split("/")[0];

  if (pageSegment === "review-changes") {
    return <HeaderReviewChangesActions appId={appId} />;
  }

  // Show save/discard on dedicated save pages, or any page that marked
  // the form dirty (e.g. testflight build detail editing "what's new").
  const showSave = SAVE_PAGES.has(pageSegment) || isDirty;
  const showNewVersion = pageSegment === OVERVIEW_PAGE;

  if (!showSave && !showNewVersion) return null;

  const selectedVersion = resolveVersion(versions, searchParams.get("version"));
  const currentPlatform = selectedVersion?.attributes.platform ?? platforms[0] ?? "IOS";
  const readOnly = selectedVersion
    ? !TEXT_EDITABLE_STATES.has(selectedVersion.attributes.appVersionState)
    : true;

  function openDialog() {
    setVersionString("");
    setPlatform(currentPlatform);
    setDialogOpen(true);
  }

  const trimmedVersion = versionString.trim();
  const versionValid = trimmedVersion !== "" && isValidVersionString(trimmedVersion);

  async function handleCreate() {
    if (!versionValid || !platform) return;
    setCreating(true);
    try {
      const data = await apiFetch<{ versionId: string }>(`/api/apps/${appId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionString: trimmedVersion, platform }),
      });
      setDialogOpen(false);
      await refresh();
      router.push(`/dashboard/apps/${appId}/store-listing?version=${data.versionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("versionPicker.createVersionFailed"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      {showNewVersion && (
        <Button
          size="sm"
          className="h-8 gap-1 text-sm"
          onClick={() => guardNavigation(openDialog)}
        >
          <Plus size={14} />
          {t("versionPicker.newVersionButton")}
        </Button>
      )}
      {showSave && isDirty && !isSaving && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-sm"
          onClick={onDiscard}
        >
          {t("reviewChanges.discard")}
        </Button>
      )}
      {showSave && (!readOnly || isDirty) && (
        <Button
          size="sm"
          className="h-8 gap-1 text-sm"
          disabled={!isDirty || isSaving}
          onClick={onSave}
        >
          {isSaving && <Spinner className="size-3.5" />}
          {isSaving ? t("versionPicker.saving") : pageSegment === "nominations" ? t("versionPicker.saveDraft") : t("versionPicker.save")}
          {!isSaving && (
            <kbd className="ml-1 text-[10px] opacity-50 font-sans">&#8984;S</kbd>
          )}
        </Button>
      )}

      {showNewVersion && (
        <CreateVersionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          versionString={versionString}
          onVersionStringChange={setVersionString}
          platform={platform}
          onPlatformChange={setPlatform}
          creating={creating}
          onSubmit={handleCreate}
        />
      )}
    </>
  );
}

const REVIEW_MODE_LABELS = {
  changes: "reviewChanges.modeDiff",
  before: "reviewChanges.modeCurrent",
  after: "reviewChanges.modeUpdated",
} as const;

/** Left-side filters for the review-changes page (renders next to breadcrumb). */
export function HeaderReviewFilters() {
  const t = useTranslations();
  const fieldLabel = useReviewFieldLabel();
  const sectionLabels = useReviewSectionLabels();
  const { appId } = useParams<{ appId?: string }>();
  const pathname = usePathname();
  const { changes } = useChangeBuffer();
  const { apps } = useApps();
  const { mode, setMode, fieldFilter, setFieldFilter, localeFilter, setLocaleFilter } = useReviewChanges();
  const [fieldOpen, setFieldOpen] = useState(false);
  const [localeOpen, setLocaleOpen] = useState(false);

  if (!appId) return null;
  const pageSegment = pathname.replace(`/dashboard/apps/${appId}`, "").replace(/^\//, "").split("/")[0];
  if (pageSegment !== "review-changes") return null;

  const primaryLocale = apps.find((a) => a.id === appId)?.primaryLocale ?? "";
  const appChanges = changes.filter((c) => c.appId === appId);
  if (appChanges.length === 0) return null;

  // Collect fields grouped by section
  const skipKeys = new Set(["locales", "localeIds", "phasedReleaseId", "_reviewDetailId"]);
  const sectionFields: { section: string; fields: string[] }[] = [];
  const sectionOrder = ["store-listing", "details", "keywords", "review"];
  for (const sec of sectionOrder) {
    const secChanges = appChanges.filter((c) => c.section === sec);
    if (secChanges.length === 0) continue;
    const fieldSet = new Set<string>();
    for (const c of secChanges) {
      const dl = c.data.locales as Record<string, Record<string, unknown>> | undefined;
      if (dl) for (const fields of Object.values(dl)) for (const k of Object.keys(fields)) fieldSet.add(k);
      for (const k of Object.keys(c.data)) if (!skipKeys.has(k)) fieldSet.add(k);
    }
    sectionFields.push({
      section: sec,
      fields: [...fieldSet].sort((a, b) => fieldLabel(a).localeCompare(fieldLabel(b))),
    });
  }

  const localeSet = new Set<string>();
  for (const c of appChanges) {
    const dl = c.data.locales as Record<string, unknown> | undefined;
    if (dl) for (const l of Object.keys(dl)) localeSet.add(l);
  }
  const allLocales = sortLocales([...localeSet], primaryLocale);

  return (
    <>
      <div className="inline-flex rounded-md border bg-muted/50 p-0.5">
        {(["changes", "before", "after"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setMode(v)}
            className={`rounded-sm px-2.5 py-1 text-sm font-medium transition-colors ${
              mode === v
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(REVIEW_MODE_LABELS[v])}
          </button>
        ))}
      </div>
      <Separator orientation="vertical" className="mx-2 !h-4" />
      <Popover open={fieldOpen} onOpenChange={setFieldOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-8 gap-1.5 px-2.5 text-sm">
            {fieldFilter === "all" ? t("reviewChanges.allFields") : fieldLabel(fieldFilter)}
            <CaretDown size={12} className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-1" align="start">
          <Command>
            <CommandList>
              <CommandGroup>
                <CommandItem value="all" onSelect={() => { setFieldFilter("all"); setFieldOpen(false); }}>
                  <Check size={14} className={fieldFilter === "all" ? "opacity-100" : "opacity-0"} />
                  {t("reviewChanges.allFields")}
                </CommandItem>
              </CommandGroup>
              {sectionFields.map((group) => (
                <CommandGroup key={group.section} heading={sectionLabels[group.section as keyof typeof sectionLabels] ?? group.section}>
                  {group.fields.map((f) => (
                    <CommandItem key={f} value={`${group.section}:${f}`} onSelect={() => { setFieldFilter(f); setFieldOpen(false); }}>
                      <Check size={14} className={fieldFilter === f ? "opacity-100" : "opacity-0"} />
                      {fieldLabel(f)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Popover open={localeOpen} onOpenChange={setLocaleOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-8 gap-1.5 px-2.5 text-sm">
            {localeFilter === "all" ? t("reviewChanges.allLocales") : localeName(localeFilter)}
            {localeFilter !== "all" && <span className="text-muted-foreground">{localeFilter}</span>}
            <CaretDown size={12} className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder={t("reviewChanges.searchLocales")} />
            <CommandList>
              <CommandEmpty>{t("reviewChanges.noLocaleFound")}</CommandEmpty>
              <CommandGroup>
                <CommandItem value="all" onSelect={() => { setLocaleFilter("all"); setLocaleOpen(false); }}>
                  <Check size={14} className={localeFilter === "all" ? "opacity-100" : "opacity-0"} />
                  {t("reviewChanges.allLocales")}
                </CommandItem>
                {allLocales.map((loc) => (
                  <CommandItem key={loc} value={`${localeName(loc)} ${loc}`} onSelect={() => { setLocaleFilter(loc); setLocaleOpen(false); }}>
                    <Check size={14} className={localeFilter === loc ? "opacity-100" : "opacity-0"} />
                    {localeName(loc)}
                    <span className="ml-auto text-muted-foreground">{loc}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}

/** Right-side buttons for the review-changes page (renders in actions area). */
function HeaderReviewChangesActions({ appId }: { appId: string }) {
  const t = useTranslations();
  const { changes, discardAll, publishAll } = useChangeBuffer();
  const { updateVersion } = useVersions();
  const [publishing, setPublishing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const appChanges = changes.filter((c) => c.appId === appId);

  async function handlePublish() {
    setPublishing(true);
    // Snapshot buffer data before publish clears it
    const snapshot = appChanges.map((c) => ({ ...c }));
    try {
      const ok = await publishAll(appId);
      if (ok) {
        toast.success(t("reviewChanges.pushSuccess"));
        // Apply published data to version cache so UI reflects changes immediately
        for (const change of snapshot) {
          if (change.section === "store-listing" || change.section === "keywords") {
            updateVersion(change.scope, (v) => {
              const d = change.data;
              const updated = {
                ...v,
                attributes: {
                  ...v.attributes,
                  ...(d.copyright !== undefined && { copyright: d.copyright as string }),
                  ...(d.releaseType !== undefined && {
                    releaseType: d.releaseType === "manually" ? "MANUAL"
                      : d.releaseType === "after-date" ? "SCHEDULED" : "AFTER_APPROVAL",
                  }),
                  ...(d.scheduledDate !== undefined && {
                    earliestReleaseDate: d.scheduledDate as string | null,
                  }),
                },
                ...(d.phasedRelease !== undefined && {
                  phasedRelease: d.phasedRelease
                    ? (v.phasedRelease ?? { id: "", attributes: { phasedReleaseState: "INACTIVE", currentDayNumber: null, startDate: null } })
                    : null,
                }),
              };
              // Update build reference
              if (d.buildId !== undefined) {
                if (d.buildId === null) {
                  updated.build = null;
                } else {
                  updated.build = v.build?.id === d.buildId
                    ? v.build
                    : { id: d.buildId as string, attributes: { version: "", uploadedDate: "", processingState: "VALID", minOsVersion: "", iconAssetToken: null } };
                }
              }
              return updated;
            });
            // Invalidate localizations cache so next page load fetches fresh
            if (change.data.locales) {
              fetch(`/api/apps/${appId}/versions/${change.scope}/localizations?refresh`).catch(() => {});
            }
          }
          if (change.section === "review") {
            const d = change.data;
            updateVersion(change.scope, (v) => {
              const prev = v.reviewDetail?.attributes;
              return {
                ...v,
                reviewDetail: {
                  id: (d._reviewDetailId as string) ?? v.reviewDetail?.id ?? "",
                  attributes: {
                    notes: (d.notes as string | null) ?? prev?.notes ?? null,
                    demoAccountRequired: (d.demoAccountRequired as boolean | undefined) ?? prev?.demoAccountRequired ?? false,
                    demoAccountName: (d.demoAccountName as string | null) ?? prev?.demoAccountName ?? null,
                    demoAccountPassword: (d.demoAccountPassword as string | null) ?? prev?.demoAccountPassword ?? null,
                    contactFirstName: (d.contactFirstName as string | null) ?? prev?.contactFirstName ?? null,
                    contactLastName: (d.contactLastName as string | null) ?? prev?.contactLastName ?? null,
                    contactPhone: (d.contactPhone as string | null) ?? prev?.contactPhone ?? null,
                    contactEmail: (d.contactEmail as string | null) ?? prev?.contactEmail ?? null,
                  },
                },
              };
            });
          }
          // Invalidate details locales cache
          if (change.section === "details" && change.data.locales) {
            fetch(`/api/apps/${appId}/info/${change.scope}/localizations?refresh`).catch(() => {});
          }
        }
      } else {
        toast.error(t("reviewChanges.pushPartialFail"));
      }
    } catch {
      toast.error(t("reviewChanges.pushFailed"));
    } finally {
      setPublishing(false);
    }
  }

  if (appChanges.length === 0) return null;

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 text-sm" onClick={() => setConfirmDiscard(true)}>
        {t("reviewChanges.discardAll")}
      </Button>
      <Button size="sm" className="h-8 text-sm" onClick={handlePublish} disabled={publishing}>
        {publishing && <Spinner className="size-3.5 mr-1.5" />}
        {t("reviewChanges.pushToAsc")}
      </Button>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("reviewChanges.discardAllTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("reviewChanges.discardAllDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => discardAll(appId)}>
              {t("reviewChanges.discardAll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CreateVersionDialog({
  open,
  onOpenChange,
  versionString,
  onVersionStringChange,
  platform,
  onPlatformChange,
  creating,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionString: string;
  onVersionStringChange: (value: string) => void;
  platform: string;
  onPlatformChange: (value: string) => void;
  creating: boolean;
  onSubmit: () => void;
}) {
  const t = useTranslations();
  const { platformLabel } = useAscLabels();
  const trimmed = versionString.trim();
  const valid = trimmed !== "" && isValidVersionString(trimmed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("versionPicker.newAppStoreVersion")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="version-string">{t("versionPicker.version")}</Label>
            <Input
              id="version-string"
              placeholder="e.g. 1.2.0"
              value={versionString}
              onChange={(e) => onVersionStringChange(e.target.value)}
              className="font-mono"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid && platform) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="platform-select">{t("versionPicker.platform")}</Label>
            <Select value={platform} onValueChange={onPlatformChange}>
              <SelectTrigger id="platform-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {platformLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {trimmed !== "" && hasInvalidVersionChars(trimmed) && (
          <p className="text-sm text-destructive">
            {t("versionPicker.versionInvalid")}
          </p>
        )}
        <Button
          onClick={onSubmit}
          disabled={!valid || !platform || creating}
        >
          {creating && <Spinner className="size-3.5" />}
          {creating ? t("versionPicker.creating") : t("versionPicker.create")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function HeaderRefreshButton() {
  const { appId } = useParams<{ appId?: string }>();
  const { refresh: refreshApps } = useApps();
  const { loading, refresh: refreshVersions } = useVersions();
  const { refresh: refreshPreReleaseVersions } = usePreReleaseVersions();
  const { guardNavigation } = useFormDirty();
  const { busy: sectionBusy, hasHandler, doRefresh: sectionRefresh } = useRefresh();
  const [refreshing, setRefreshing] = useState(false);

  const pathname = usePathname();
  const isReviewChanges = appId && pathname.replace(`/dashboard/apps/${appId}`, "").replace(/^\//, "").startsWith("review-changes");
  if (isReviewChanges) return null;
  if (!appId && !hasHandler) return null;

  async function doDefaultRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId }),
      });
      await Promise.all([refreshApps(), refreshVersions(), refreshPreReleaseVersions()]);
    } finally {
      setRefreshing(false);
    }
  }

  const busy = sectionBusy || (appId ? loading : false) || refreshing;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="ml-2 size-8"
      onClick={() => guardNavigation(hasHandler ? sectionRefresh : doDefaultRefresh)}
      disabled={busy}
    >
      <ArrowsClockwise size={14} className={busy ? "animate-spin" : ""} />
    </Button>
  );
}
