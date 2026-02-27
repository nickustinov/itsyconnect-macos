"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Images, CloudArrowUp, Plus, SpinnerGap, Image } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { resolveVersion, EDITABLE_STATES } from "@/lib/asc/version-types";
import { useLocalizations } from "@/lib/hooks/use-localizations";
import { useScreenshotSets } from "@/lib/hooks/use-screenshot-sets";
import { localeName, LOCALE_NAMES } from "@/lib/asc/locale-names";

/** Sort locales: primary locale first, rest alphabetical by display name. */
function sortLocales(codes: string[], primaryLocale: string): string[] {
  return [...codes].sort((a, b) => {
    if (a === primaryLocale) return -1;
    if (b === primaryLocale) return 1;
    return localeName(a).localeCompare(localeName(b));
  });
}

const DISPLAY_TYPE_LABELS: Record<string, string> = {
  APP_IPHONE_67: "iPhone 6.7\"",
  APP_IPHONE_61: "iPhone 6.1\"",
  APP_IPHONE_65: "iPhone 6.5\"",
  APP_IPHONE_58: "iPhone 5.8\"",
  APP_IPHONE_55: "iPhone 5.5\"",
  APP_IPHONE_47: "iPhone 4.7\"",
  APP_IPHONE_40: "iPhone 4\"",
  APP_IPHONE_35: "iPhone 3.5\"",
  APP_IPAD_PRO_3GEN_129: "iPad Pro 12.9\"",
  APP_IPAD_PRO_3GEN_11: "iPad Pro 11\"",
  APP_IPAD_PRO_129: "iPad Pro 12.9\" (2nd)",
  APP_IPAD_105: "iPad 10.5\"",
  APP_IPAD_97: "iPad 9.7\"",
  APP_DESKTOP: "Mac",
  APP_APPLE_TV: "Apple TV",
  APP_APPLE_VISION_PRO: "Apple Vision Pro",
};

export default function ScreenshotsPage() {
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
  const primaryLocale = app?.primaryLocale ?? "";

  const [locales, setLocales] = useState<string[]>([]);
  const [selectedLocale, setSelectedLocale] = useState("");
  const [addLocaleOpen, setAddLocaleOpen] = useState(false);

  // Reset locales when localizations change
  useEffect(() => {
    const sorted = sortLocales(
      localizations.map((l) => l.attributes.locale),
      primaryLocale,
    );
    setLocales(sorted);
    setSelectedLocale(sorted[0] ?? "");
  }, [localizations, primaryLocale]);

  // Find the localization ID for the selected locale to fetch screenshots
  const selectedLocalization = localizations.find(
    (l) => l.attributes.locale === selectedLocale,
  );
  const localizationId = selectedLocalization?.id ?? "";

  const { screenshotSets, loading: ssLoading } = useScreenshotSets(
    appId,
    versionId,
    localizationId,
  );

  function handleAddLocale(locale: string) {
    setLocales((prev) => sortLocales([...prev, locale], primaryLocale));
    setSelectedLocale(locale);
    setAddLocaleOpen(false);
    toast.success(`Added ${localeName(locale)}`);
  }

  const availableLocales = Object.entries(LOCALE_NAMES).filter(
    ([code]) => !locales.includes(code)
  );

  if (!app) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        App not found
      </div>
    );
  }

  if (versionsLoading || locLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <SpinnerGap size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
      ) : ssLoading ? (
        <div className="flex items-center justify-center py-20">
          <SpinnerGap size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : screenshotSets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <Images size={48} className="text-muted-foreground/50" />
          <h2 className="mt-4 text-lg font-medium">No screenshots</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Upload screenshots for each device type and locale. Drag to
            reorder.
          </p>
          {!readOnly && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() =>
                toast.info("Screenshot upload not available in prototype")
              }
            >
              <CloudArrowUp size={16} className="mr-2" />
              Upload screenshots
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {screenshotSets.map((set) => (
            <Card key={set.id}>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  {DISPLAY_TYPE_LABELS[set.attributes.screenshotDisplayType] ??
                    set.attributes.screenshotDisplayType}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {set.screenshots.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No screenshots uploaded.
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {set.screenshots.map((ss) => (
                      <div
                        key={ss.id}
                        className="flex shrink-0 flex-col items-center gap-1.5 rounded-lg border bg-muted/30 p-3"
                      >
                        <Image size={32} className="text-muted-foreground/50" />
                        <p className="max-w-[120px] truncate text-xs text-muted-foreground">
                          {ss.attributes.fileName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(ss.attributes.fileSize / 1024).toFixed(0)} KB
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {!readOnly && (
            <Button
              variant="outline"
              onClick={() =>
                toast.info("Screenshot upload not available in prototype")
              }
            >
              <CloudArrowUp size={16} className="mr-2" />
              Upload screenshots
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
