"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MagicWand } from "@phosphor-icons/react";
import type { AscNomination } from "@/lib/asc/nominations";
import { useTranslations } from "@/lib/i18n/locale-context";

export function CopyNotesButton({
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
  const t = useTranslations();
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
          <DropdownMenuSubTrigger>{t("nominations.copyFrom")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {!loaded ? (
              <DropdownMenuItem disabled>{t("common.loading")}</DropdownMenuItem>
            ) : nominations.length === 0 ? (
              <DropdownMenuItem disabled>{t("nominations.noPreviousNotes")}</DropdownMenuItem>
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
