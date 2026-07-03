"use client";

import { useState } from "react";
import { Check, CaretUpDown } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
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
import { STOREFRONTS, POPULAR_STOREFRONTS } from "@/lib/asc/storefronts";
import { useTranslations } from "@/lib/i18n/locale-context";

interface StorefrontPickerProps {
  value: string;
  onChange: (iso: string) => void;
}

export function StorefrontPicker({ value, onChange }: StorefrontPickerProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const selected = STOREFRONTS[value];

  const otherCodes = Object.keys(STOREFRONTS)
    .filter((iso) => !POPULAR_STOREFRONTS.includes(iso))
    .sort((a, b) => STOREFRONTS[a].name.localeCompare(STOREFRONTS[b].name));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[260px] justify-between"
        >
          {selected?.name ?? t("keywords.selectStorefront")}
          <CaretUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0">
        <Command>
          <CommandInput placeholder={t("keywords.searchStorefronts")} />
          <CommandList>
            <CommandEmpty>{t("keywords.noStorefrontFound")}</CommandEmpty>
            <CommandGroup heading={t("keywords.popular")}>
              {POPULAR_STOREFRONTS.map((iso) => (
                <CommandItem
                  key={iso}
                  value={STOREFRONTS[iso].name}
                  onSelect={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      value === iso ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {STOREFRONTS[iso].name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading={t("keywords.allStorefronts")}>
              {otherCodes.map((iso) => (
                <CommandItem
                  key={iso}
                  value={STOREFRONTS[iso].name}
                  onSelect={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      value === iso ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {STOREFRONTS[iso].name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
