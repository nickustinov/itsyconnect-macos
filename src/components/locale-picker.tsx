"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CaretDown, Check, Plus, X } from "@phosphor-icons/react";
import { localeName, LOCALE_NAMES } from "@/lib/asc/locale-names";
import type { SectionName } from "@/lib/section-locales-context";

const SECTION_LABELS: Record<SectionName, string> = {
  "store-listing": "store listing",
  details: "details",
  screenshots: "screenshots",
};

interface LocalePickerProps {
  locales: string[];
  selectedLocale: string;
  primaryLocale: string;
  onLocaleChange: (code: string) => void;
  onLocaleAdd: (code: string) => void;
  onLocalesAdd?: (codes: string[]) => void;
  onLocaleDelete?: (code: string) => void;
  section: SectionName;
  otherSectionLocales?: Partial<Record<SectionName, string[]>>;
  availableLocales?: string[];
  readOnly?: boolean;
}

export function LocalePicker({
  locales,
  selectedLocale,
  primaryLocale,
  onLocaleChange,
  onLocaleAdd,
  onLocalesAdd,
  onLocaleDelete,
  section,
  otherSectionLocales,
  availableLocales: availableLocalesProp,
  readOnly,
}: LocalePickerProps) {
  const [open, setOpen] = useState(false);

  const activeSet = useMemo(() => new Set(locales), [locales]);

  // Locales available to add – sorted by display name
  const addableCodes = useMemo(() => {
    const codes = availableLocalesProp
      ? availableLocalesProp.filter((code) => !activeSet.has(code))
      : Object.keys(LOCALE_NAMES).filter((code) => !activeSet.has(code));
    return codes.sort((a, b) => localeName(a).localeCompare(localeName(b)));
  }, [availableLocalesProp, activeSet]);

  // Cross-section suggestions: locales used in other sections but not here
  const suggestions = useMemo(() => {
    if (!otherSectionLocales) return [];
    const result: { section: SectionName; label: string; codes: string[] }[] = [];
    for (const [sec, codes] of Object.entries(otherSectionLocales) as [SectionName, string[]][]) {
      const missing = codes.filter(
        (c) => !activeSet.has(c) && (availableLocalesProp ? availableLocalesProp.includes(c) : true),
      );
      if (missing.length > 0) {
        result.push({
          section: sec,
          label: SECTION_LABELS[sec],
          codes: missing,
        });
      }
    }
    return result;
  }, [otherSectionLocales, activeSet, availableLocalesProp]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-7 gap-1 px-2 text-xs">
          {localeName(selectedLocale)}
          <span className="text-muted-foreground">{selectedLocale}</span>
          <CaretDown size={12} className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search locales..." />
          <CommandList>
            <CommandEmpty>No locales found.</CommandEmpty>

            {/* Active locales */}
            <CommandGroup>
              {locales.map((code) => (
                <CommandItem
                  key={code}
                  value={`${localeName(code)} ${code}`}
                  onSelect={() => {
                    onLocaleChange(code);
                    setOpen(false);
                  }}
                  className="group"
                >
                  {code === selectedLocale && (
                    <Check size={14} className="text-foreground" />
                  )}
                  <span className={code !== selectedLocale ? "pl-[22px]" : ""}>
                    {localeName(code)}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                    {code}
                    {code === primaryLocale && (
                      <Badge
                        variant="secondary"
                        className="px-1.5 py-0 text-[10px] leading-4"
                      >
                        primary
                      </Badge>
                    )}
                    {!readOnly &&
                      onLocaleDelete &&
                      code !== primaryLocale && (
                        <button
                          type="button"
                          className="hidden rounded p-0.5 hover:bg-destructive/10 hover:text-destructive group-hover:inline-flex"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onLocaleDelete(code);
                          }}
                        >
                          <X size={12} />
                        </button>
                      )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>

            {/* Add locale – flat groups so cmdk search filtering works */}
            {!readOnly && addableCodes.length > 0 && (
              <>
                <CommandSeparator />

                {/* Cross-section suggestions */}
                {suggestions.map((sug) => (
                  <CommandGroup
                    key={sug.section}
                    heading={`Used in ${sug.label}`}
                  >
                    {sug.codes.map((code) => (
                      <CommandItem
                        key={`sug-${code}`}
                        value={`${localeName(code)} ${code} ${sug.label}`}
                        onSelect={() => {
                          onLocaleAdd(code);
                        }}
                      >
                        <Plus size={14} className="text-muted-foreground" />
                        <span>{localeName(code)}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {code}
                        </span>
                      </CommandItem>
                    ))}
                    {onLocalesAdd && sug.codes.length > 1 && (
                      <CommandItem
                        value={`add all from ${sug.label}`}
                        onSelect={() => {
                          onLocalesAdd(sug.codes);
                        }}
                      >
                        <Plus size={14} className="text-muted-foreground" />
                        <span className="text-muted-foreground">
                          Add all from {sug.label}
                        </span>
                      </CommandItem>
                    )}
                  </CommandGroup>
                ))}

                {/* All available locales */}
                {(() => {
                  const sugSet = new Set(suggestions.flatMap((s) => s.codes));
                  const remaining = addableCodes.filter((c) => !sugSet.has(c));
                  if (remaining.length === 0) return null;
                  return (
                    <CommandGroup heading={suggestions.length > 0 ? "All locales" : "Add locale"}>
                      {remaining.map((code) => (
                        <CommandItem
                          key={`add-${code}`}
                          value={`${localeName(code)} ${code}`}
                          onSelect={() => {
                            onLocaleAdd(code);
                          }}
                        >
                          <Plus size={14} className="text-muted-foreground" />
                          <span>{localeName(code)}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {code}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  );
                })()}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
