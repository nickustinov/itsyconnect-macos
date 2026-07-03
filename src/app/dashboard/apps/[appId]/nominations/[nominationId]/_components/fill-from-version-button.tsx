"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { MagicWand } from "@phosphor-icons/react";
import { toast } from "sonner";
import { AIRequiredDialog } from "@/components/ai-required-dialog";
import { useAIStatus } from "@/lib/hooks/use-ai-status";
import { normalizeLocale } from "@/lib/asc/locale-names";
import {
  STATE_DOT_COLORS,
  type AscVersion,
} from "@/lib/asc/version-types";
import type { AscLocalization } from "@/lib/asc/localizations";
import type { NominationType } from "@/lib/asc/nominations";
import { LIMITS, type NominationFormData } from "./nomination-constants";
import { useTranslations } from "@/lib/i18n/locale-context";
import { useAscLabels } from "@/lib/i18n/use-asc-labels";

// ── Platform -> device family mapping ─────────────────────────────────

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

export function FillFromVersionButton({
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
  const t = useTranslations();
  const { platformLabel, versionStateLabel } = useAscLabels();
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

      // Determine type: version 1.0.x -> launch, else enhancements
      const isLaunch = /^1\.0(\.0)?$/.test(version.attributes.versionString);
      const type: NominationType = isLaunch
        ? "APP_LAUNCH"
        : "APP_ENHANCEMENTS";

      // Map platform -> device families
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

      toast.success(t("nominations.filledFromVersion", { version: version.attributes.versionString }));
    } catch {
      toast.error(t("nominations.generateFailed"));
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
            {t("nominations.fillFromVersion")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandEmpty>{t("nominations.noVersionsFound")}</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {versions.map((v) => (
                  <CommandItem
                    key={v.id}
                    value={`${v.attributes.versionString} ${versionStateLabel(v.attributes.appVersionState)} ${platformLabel(v.attributes.platform)}`}
                    onSelect={() => handlePick(v)}
                  >
                    <span className="font-mono">
                      {v.attributes.versionString}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="text-xs">
                        {platformLabel(v.attributes.platform)}
                      </span>
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${STATE_DOT_COLORS[v.attributes.appVersionState] ?? "bg-muted-foreground"}`}
                      />
                      {versionStateLabel(v.attributes.appVersionState)}
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
