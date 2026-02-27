"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppWindow, Lock, PencilSimple, Plus, SpinnerGap } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { resolveVersion, EDITABLE_STATES } from "@/lib/asc/version-types";
import { useLocalizations } from "@/lib/hooks/use-localizations";
import { useAppInfo, useAppInfoLocalizations } from "@/lib/hooks/use-app-info";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import type { AscLocalization } from "@/lib/asc/localizations";
import type { AscAppInfoLocalization } from "@/lib/asc/app-info";
import {
  localeName,
  LOCALE_NAMES,
  FIELD_LIMITS,
} from "@/lib/asc/locale-names";


interface LocaleFields {
  name: string;
  subtitle: string;
  description: string;
  keywords: string;
  whatsNew: string;
  promotionalText: string;
}

/** Sort locales: primary locale first, rest alphabetical by display name. */
function sortLocales(codes: string[], primaryLocale: string): string[] {
  return [...codes].sort((a, b) => {
    if (a === primaryLocale) return -1;
    if (b === primaryLocale) return 1;
    return localeName(a).localeCompare(localeName(b));
  });
}

function emptyLocaleFields(): LocaleFields {
  return {
    name: "",
    subtitle: "",
    description: "",
    keywords: "",
    whatsNew: "",
    promotionalText: "",
  };
}

function buildLocaleData(
  localizations: AscLocalization[],
  appInfoLocs: AscAppInfoLocalization[],
): Record<string, LocaleFields> {
  const data: Record<string, LocaleFields> = {};

  // Build lookup for app info localizations by locale
  const infoByLocale = new Map<string, AscAppInfoLocalization>();
  for (const loc of appInfoLocs) {
    infoByLocale.set(loc.attributes.locale, loc);
  }

  for (const loc of localizations) {
    const info = infoByLocale.get(loc.attributes.locale);
    data[loc.attributes.locale] = {
      name: info?.attributes.name ?? "",
      subtitle: info?.attributes.subtitle ?? "",
      description: loc.attributes.description ?? "",
      keywords: loc.attributes.keywords ?? "",
      whatsNew: loc.attributes.whatsNew ?? "",
      promotionalText: loc.attributes.promotionalText ?? "",
    };
  }
  return data;
}

export default function StoreListingPage() {
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { versions, loading: versionsLoading } = useVersions();

  const selectedVersion = useMemo(
    () => resolveVersion(versions, searchParams.get("version")),
    [versions, searchParams],
  );
  const versionId = selectedVersion?.id ?? "";

  const readOnly = selectedVersion
    ? !EDITABLE_STATES.has(selectedVersion.attributes.appVersionState)
    : false;

  const { localizations, loading: locLoading } = useLocalizations(appId, versionId);

  // App info localizations for name & subtitle (app-level, not version-specific)
  const { appInfos, loading: infoLoading } = useAppInfo(appId);
  const appInfoId = pickAppInfo(appInfos)?.id ?? "";
  const { localizations: appInfoLocs, loading: appInfoLocLoading } =
    useAppInfoLocalizations(appId, appInfoId);

  const primaryLocale = app?.primaryLocale ?? "";

  const [localeData, setLocaleData] = useState<Record<string, LocaleFields>>({});
  const [locales, setLocales] = useState<string[]>([]);
  const [selectedLocale, setSelectedLocale] = useState("");
  const [addLocaleOpen, setAddLocaleOpen] = useState(false);

  const current = localeData[selectedLocale] ?? emptyLocaleFields();

  const [releaseType, setReleaseType] = useState("manually");
  const [phasedRelease, setPhasedRelease] = useState(false);

  // Reset locale data when localizations change
  useEffect(() => {
    const data = buildLocaleData(localizations, appInfoLocs);
    setLocaleData(data);
    const sorted = sortLocales(Object.keys(data), primaryLocale);
    setLocales(sorted);
    setSelectedLocale(sorted[0] ?? "");
  }, [localizations, appInfoLocs, primaryLocale]);

  const updateField = useCallback(
    (field: keyof LocaleFields, value: string) => {
      setLocaleData((prev) => ({
        ...prev,
        [selectedLocale]: { ...prev[selectedLocale], [field]: value },
      }));
    },
    [selectedLocale]
  );

  function handleAddLocale(locale: string) {
    setLocaleData((prev) => {
      const next = { ...prev, [locale]: emptyLocaleFields() };
      setLocales(sortLocales(Object.keys(next), primaryLocale));
      return next;
    });
    setSelectedLocale(locale);
    setAddLocaleOpen(false);
    toast.success(`Added ${localeName(locale)}`);
  }

  const availableLocales = Object.entries(LOCALE_NAMES).filter(
    ([code]) => !localeData[code]
  );

  if (!app) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        App not found
      </div>
    );
  }

  if (versionsLoading || locLoading || infoLoading || appInfoLocLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <SpinnerGap size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-lg font-medium">No versions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a version to start editing your store listing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Read-only banner */}
        {readOnly && (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            <Lock size={16} className="shrink-0" />
            This version is live – showing what was submitted. Select an
            editable version to make changes.
          </div>
        )}

        {/* Version string */}
        <section className="space-y-2">
          <h3 className="section-title">Version</h3>
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight">
              {selectedVersion?.attributes.versionString ?? "–"}
            </span>
            {!readOnly && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                onClick={() =>
                  toast.info("Version editing not available in prototype")
                }
              >
                <PencilSimple size={14} />
              </Button>
            )}
          </div>
        </section>

        {/* Locale tabs + add locale */}
        <div className="flex flex-wrap items-center gap-2">
          {locales.length > 0 && (
            <Tabs value={selectedLocale} onValueChange={setSelectedLocale}>
              <TabsList className="!h-auto flex-wrap justify-start">
                {locales.map((locale) => (
                  <TabsTrigger key={locale} value={locale} className="flex-none">
                    {localeName(locale)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {!readOnly && availableLocales.length > 0 && (
            <Popover open={addLocaleOpen} onOpenChange={setAddLocaleOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <Plus size={14} />
                  Add locale
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search locales..." />
                  <CommandList>
                    <CommandEmpty>No locales found.</CommandEmpty>
                    <CommandGroup>
                      {availableLocales.map(([code, name]) => (
                        <CommandItem
                          key={code}
                          value={`${name} ${code}`}
                          onSelect={() => handleAddLocale(code)}
                        >
                          <span>{name}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {code}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {locales.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No localizations for this version.
          </div>
        ) : (
          <>
            {/* Name & subtitle */}
            <section className="space-y-2">
              <h3 className="section-title">Name &amp; subtitle</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Name</label>
                  <Input
                    value={current.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    readOnly={readOnly}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Subtitle</label>
                  <Input
                    value={current.subtitle}
                    onChange={(e) => updateField("subtitle", e.target.value)}
                    readOnly={readOnly}
                    className="text-sm"
                  />
                </div>
              </div>
            </section>

            {/* Description */}
            <section className="space-y-2">
              <h3 className="section-title">Description</h3>
              <Card className="gap-0 py-0">
                <CardContent className="px-5 py-4">
                  <Textarea
                    value={current.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    readOnly={readOnly}
                    placeholder="Describe your app..."
                    className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none font-mono text-xs md:text-xs min-h-0"
                  />
                </CardContent>
                <div className="flex items-center justify-end border-t px-3 py-1.5">
                  <CharCount
                    value={current.description}
                    limit={FIELD_LIMITS.description}
                  />
                </div>
              </Card>
            </section>

            {/* Keywords */}
            <section className="space-y-2">
              <h3 className="section-title">Keywords</h3>
              <Card className="gap-0 py-0">
                <CardContent className="px-5 py-4">
                  <Input
                    value={current.keywords}
                    onChange={(e) => updateField("keywords", e.target.value)}
                    readOnly={readOnly}
                    placeholder="keyword1,keyword2,keyword3"
                    className="border-0 p-0 shadow-none focus-visible:ring-0 font-mono text-xs md:text-xs h-auto"
                  />
                </CardContent>
                <div className="flex items-center justify-end border-t px-3 py-1.5">
                  <CharCount
                    value={current.keywords}
                    limit={FIELD_LIMITS.keywords}
                  />
                </div>
              </Card>
            </section>

            {/* What's new */}
            <section className="space-y-2">
              <h3 className="section-title">What&apos;s new</h3>
              <Card className="gap-0 py-0">
                <CardContent className="px-5 py-4">
                  <Textarea
                    value={current.whatsNew}
                    onChange={(e) => updateField("whatsNew", e.target.value)}
                    readOnly={readOnly}
                    placeholder="Describe what's new in this version..."
                    className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none font-mono text-xs md:text-xs min-h-0"
                  />
                </CardContent>
                <div className="flex items-center justify-end border-t px-3 py-1.5">
                  <CharCount
                    value={current.whatsNew}
                    limit={FIELD_LIMITS.whatsNew}
                  />
                </div>
              </Card>
            </section>

            {/* Promotional text */}
            <section className="space-y-2">
              <h3 className="section-title">Promotional text</h3>
              <Card className="gap-0 py-0">
                <CardContent className="px-5 py-4">
                  <Textarea
                    value={current.promotionalText}
                    onChange={(e) =>
                      updateField("promotionalText", e.target.value)
                    }
                    readOnly={readOnly}
                    placeholder="Inform App Store visitors of current features..."
                    className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none font-mono text-xs md:text-xs min-h-0"
                  />
                </CardContent>
                <div className="flex items-center justify-end border-t px-3 py-1.5">
                  <CharCount
                    value={current.promotionalText}
                    limit={FIELD_LIMITS.promotionalText}
                  />
                </div>
              </Card>
            </section>

          </>
        )}

        {/* Build */}
        <BuildSection version={selectedVersion} />

        {/* Release settings */}
        <section className="space-y-6">
          <h3 className="section-title">Release settings</h3>

          <div className="space-y-3">
            <p className="text-sm font-medium">Release method</p>
            <Tabs
              value={releaseType}
              onValueChange={readOnly ? undefined : setReleaseType}
              className="w-full max-w-md"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="automatically" disabled={readOnly}>
                  Automatic
                </TabsTrigger>
                <TabsTrigger value="manually" disabled={readOnly}>
                  Manual
                </TabsTrigger>
                <TabsTrigger value="after-date" disabled={readOnly}>
                  Scheduled
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-sm text-muted-foreground">
              {releaseType === "automatically" &&
                "Goes live as soon as App Review approves it."}
              {releaseType === "manually" &&
                "Stays on hold after approval – you decide when to release."}
              {releaseType === "after-date" &&
                "Released on a date you choose, after approval."}
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Phased rollout</p>
            <p className="text-sm text-muted-foreground">
              Gradually roll out to users over 7 days. Only affects automatic
              updates – manual downloads get the new version immediately.
            </p>
            <div className="flex items-center gap-3">
              <Switch
                checked={phasedRelease}
                onCheckedChange={setPhasedRelease}
                disabled={readOnly}
              />
              <Label className="text-sm">Enable 7-day phased rollout</Label>
            </div>
          </div>
        </section>
    </div>
  );
}

function BuildSection({ version }: { version?: { build: { id: string; attributes: { version: string; uploadedDate: string } } | null; attributes: { versionString: string } } }) {
  const build = version?.build;

  return (
    <section className="space-y-2">
      <h3 className="section-title">Build</h3>
      {build ? (
        <div className="flex items-center gap-4 rounded-lg border p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm">
            <AppWindow size={20} weight="fill" />
          </div>
          <div>
            <p className="font-semibold">Build {build.attributes.version}</p>
            <p className="text-sm text-muted-foreground">
              {new Date(build.attributes.uploadedDate).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              &middot; Version {version?.attributes.versionString}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No build attached to this version yet.
        </div>
      )}
    </section>
  );
}


function CharCount({ value, limit }: { value: string; limit?: number }) {
  const count = value?.length ?? 0;
  if (!limit) return null;
  const over = count > limit;

  return (
    <span
      className={`text-xs tabular-nums ${over ? "font-medium text-destructive" : "text-muted-foreground"}`}
    >
      {count}/{limit}
    </span>
  );
}
