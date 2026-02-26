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
import { AppWindow, Lock, PencilSimple, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  MOCK_APPS,
  getAppVersions,
  getVersionLocalizations,
  getVersionBuild,
  resolveVersion,
} from "@/lib/mock-data";
import {
  localeName,
  LOCALE_NAMES,
  FIELD_LIMITS,
} from "@/lib/asc/locale-names";

const EDITABLE_STATES = new Set([
  "PREPARE_FOR_SUBMISSION",
  "REJECTED",
  "METADATA_REJECTED",
  "DEVELOPER_REJECTED",
]);

interface LocaleFields {
  name: string;
  subtitle: string;
  description: string;
  keywords: string;
  whatsNew: string;
  promotionalText: string;
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

function buildLocaleData(versionId: string): Record<string, LocaleFields> {
  const data: Record<string, LocaleFields> = {};
  for (const loc of getVersionLocalizations(versionId)) {
    data[loc.locale] = {
      name: loc.name,
      subtitle: loc.subtitle ?? "",
      description: loc.description ?? "",
      keywords: loc.keywords ?? "",
      whatsNew: loc.whatsNew ?? "",
      promotionalText: loc.promotionalText ?? "",
    };
  }
  return data;
}

export default function StoreListingPage() {
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const app = MOCK_APPS.find((a) => a.id === appId);
  const versions = getAppVersions(appId);

  const selectedVersion = useMemo(
    () => resolveVersion(appId, searchParams.get("version")),
    [appId, searchParams],
  );
  const versionId = selectedVersion?.id ?? "";

  const readOnly = selectedVersion
    ? !EDITABLE_STATES.has(selectedVersion.appVersionState)
    : false;

  const [localeData, setLocaleData] = useState<Record<string, LocaleFields>>(
    () => buildLocaleData(versionId)
  );

  const locales = Object.keys(localeData);

  const [selectedLocale, setSelectedLocale] = useState(locales[0] ?? "");
  const [addLocaleOpen, setAddLocaleOpen] = useState(false);

  const current = localeData[selectedLocale] ?? emptyLocaleFields();

  const [releaseType, setReleaseType] = useState("manually");
  const [phasedRelease, setPhasedRelease] = useState(false);

  // Reset locale data when version changes via header picker
  useEffect(() => {
    const data = buildLocaleData(versionId);
    setLocaleData(data);
    const newLocales = Object.keys(data);
    setSelectedLocale(newLocales[0] ?? "");
  }, [versionId]);

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
    setLocaleData((prev) => ({ ...prev, [locale]: emptyLocaleFields() }));
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
              {selectedVersion?.versionString ?? "–"}
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
        <div className="flex items-center gap-2">
          {locales.length > 0 && (
            <Tabs value={selectedLocale} onValueChange={setSelectedLocale}>
              <TabsList>
                {locales.map((locale) => (
                  <TabsTrigger key={locale} value={locale}>
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
              <div className="grid grid-cols-[1fr,auto] gap-6">
                <div className="space-y-4">
                  <Card className="gap-0 py-0">
                    <CardContent className="px-5 py-4">
                      <Input
                        value={current.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        readOnly={readOnly}
                        placeholder="App name"
                        className="border-0 p-0 shadow-none focus-visible:ring-0 font-mono text-sm h-auto"
                      />
                    </CardContent>
                    <div className="flex items-center justify-end border-t px-3 py-1.5">
                      <CharCount
                        value={current.name}
                        limit={FIELD_LIMITS.name}
                      />
                    </div>
                  </Card>
                  <Card className="gap-0 py-0">
                    <CardContent className="px-5 py-4">
                      <Input
                        value={current.subtitle}
                        onChange={(e) =>
                          updateField("subtitle", e.target.value)
                        }
                        readOnly={readOnly}
                        placeholder="Subtitle"
                        className="border-0 p-0 shadow-none focus-visible:ring-0 font-mono text-sm h-auto"
                      />
                    </CardContent>
                    <div className="flex items-center justify-end border-t px-3 py-1.5">
                      <CharCount
                        value={current.subtitle}
                        limit={FIELD_LIMITS.subtitle}
                      />
                    </div>
                  </Card>
                </div>
                <AppStorePreview
                  name={current.name}
                  subtitle={current.subtitle}
                />
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
                    className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none font-mono text-sm min-h-0"
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
                    className="border-0 p-0 shadow-none focus-visible:ring-0 font-mono text-sm h-auto"
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
                    className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none font-mono text-sm min-h-0"
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
                    className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none font-mono text-sm min-h-0"
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
        <BuildSection versionId={selectedVersion?.id ?? ""} />

        {/* Release settings */}
        <section className="space-y-6 pb-8">
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

function BuildSection({ versionId }: { versionId: string }) {
  const build = getVersionBuild(versionId);

  return (
    <section className="space-y-2">
      <h3 className="section-title">Build</h3>
      {build ? (
        <div className="flex items-center gap-4 rounded-lg border p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm">
            <AppWindow size={20} weight="fill" />
          </div>
          <div>
            <p className="font-semibold">Build {build.buildNumber}</p>
            <p className="text-sm text-muted-foreground">
              {new Date(build.uploadedDate).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              &middot; Version {build.versionString}
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

function AppStorePreview({
  name,
  subtitle,
}: {
  name: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-2">
      <h3 className="section-title">Preview</h3>
      <div className="w-64 rounded-2xl border bg-card p-3">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm">
            <AppWindow size={22} weight="fill" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">
              {name || "App name"}
            </p>
            <p className="truncate text-xs text-muted-foreground leading-tight mt-0.5">
              {subtitle || "Subtitle"}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-3.5 py-1 text-xs font-bold text-primary">
            GET
          </span>
        </div>
      </div>
    </div>
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
