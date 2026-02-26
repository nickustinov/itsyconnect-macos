"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Images, CloudArrowUp, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
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
import {
  MOCK_APPS,
  getVersionLocalizations,
  resolveVersion,
} from "@/lib/mock-data";
import { localeName, LOCALE_NAMES } from "@/lib/asc/locale-names";

const EDITABLE_STATES = new Set([
  "PREPARE_FOR_SUBMISSION",
  "REJECTED",
  "METADATA_REJECTED",
  "DEVELOPER_REJECTED",
]);

export default function ScreenshotsPage() {
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const app = MOCK_APPS.find((a) => a.id === appId);

  const selectedVersion = useMemo(
    () => resolveVersion(appId, searchParams.get("version")),
    [appId, searchParams],
  );
  const versionId = selectedVersion?.id ?? "";

  const readOnly = selectedVersion
    ? !EDITABLE_STATES.has(selectedVersion.appVersionState)
    : false;

  const [locales, setLocales] = useState<string[]>(() =>
    getVersionLocalizations(versionId).map((l) => l.locale)
  );
  const [selectedLocale, setSelectedLocale] = useState(locales[0] ?? "");
  const [addLocaleOpen, setAddLocaleOpen] = useState(false);

  // Reset locales when version changes via header picker
  useEffect(() => {
    const newLocales = getVersionLocalizations(versionId).map((l) => l.locale);
    setLocales(newLocales);
    setSelectedLocale(newLocales[0] ?? "");
  }, [versionId]);

  function handleAddLocale(locale: string) {
    setLocales((prev) => [...prev, locale]);
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

  return (
    <div className="space-y-6">
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
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <Images size={48} className="text-muted-foreground/50" />
          <h2 className="mt-4 text-lg font-medium">Screenshots</h2>
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
      )}
    </div>
  );
}
