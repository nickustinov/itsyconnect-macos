"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { localeName } from "@/lib/asc/locale-names";

interface SectionInfo {
  label: string;
  exists: boolean;
}

export interface RemoveLocaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  appId: string;
  versionId: string;
  appInfoId: string;
  /** Which sections have this locale. */
  sections: {
    storeListing: boolean;
    appDetails: boolean;
    screenshots: boolean;
  };
  /** Called after deletion completes so pages can refresh. */
  onRemoved: () => void;
}

export function RemoveLocaleDialog({
  open,
  onOpenChange,
  locale,
  appId,
  versionId,
  appInfoId,
  sections,
  onRemoved,
}: RemoveLocaleDialogProps) {
  const [storeListing, setStoreListing] = useState(true);
  const [appDetails, setAppDetails] = useState(true);
  const [screenshots, setScreenshots] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sectionList: { key: string; label: string; exists: boolean; checked: boolean; setChecked: (v: boolean) => void }[] = [
    { key: "storeListing", label: "Store listing", exists: sections.storeListing, checked: storeListing, setChecked: setStoreListing },
    { key: "appDetails", label: "App details", exists: sections.appDetails, checked: appDetails, setChecked: setAppDetails },
    { key: "screenshots", label: "Screenshots", exists: sections.screenshots, checked: screenshots, setChecked: setScreenshots },
  ];

  const anyChecked = sectionList.some((s) => s.exists && s.checked);

  async function handleRemove() {
    setRemoving(true);
    setError(null);

    try {
      const promises: Promise<void>[] = [];

      // Store listing + screenshots share the version localization.
      // If either is checked, we need to handle the version localization.
      // Screenshots-only locales also live under version localizations.
      if ((storeListing && sections.storeListing) || (screenshots && sections.screenshots)) {
        promises.push(
          deleteLocalization(
            `/api/apps/${appId}/versions/${versionId}/localizations`,
            locale,
          ),
        );
      }

      if (appDetails && sections.appDetails) {
        promises.push(
          deleteLocalization(
            `/api/apps/${appId}/info/${appInfoId}/localizations`,
            locale,
          ),
        );
      }

      await Promise.all(promises);

      onOpenChange(false);
      onRemoved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove locale");
    } finally {
      setRemoving(false);
    }
  }

  // Reset state when dialog opens
  function handleOpenChange(open: boolean) {
    if (open) {
      setStoreListing(true);
      setAppDetails(true);
      setScreenshots(true);
      setError(null);
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {localeName(locale)}</DialogTitle>
          <DialogDescription>
            Choose which sections to remove this locale from. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {sectionList.map((s) => (
            <label
              key={s.key}
              className={`flex items-center gap-3 rounded-md px-3 py-2 ${
                s.exists ? "cursor-pointer hover:bg-muted/50" : "opacity-40"
              }`}
            >
              <Checkbox
                checked={s.exists && s.checked}
                onCheckedChange={(v) => s.setChecked(v === true)}
                disabled={!s.exists}
              />
              <span className="text-sm font-medium">{s.label}</span>
              {!s.exists && (
                <span className="text-xs text-muted-foreground">No locale</span>
              )}
            </label>
          ))}
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleRemove}
            disabled={!anyChecked || removing}
          >
            {removing ? (
              <>
                <Spinner className="size-3.5" />
                Removing…
              </>
            ) : (
              "Remove"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Delete a locale by sending it as an empty entry with its existing ID. */
async function deleteLocalization(url: string, locale: string): Promise<void> {
  // First fetch to get the existing localization ID
  const listRes = await fetch(`${url}?refresh`);
  if (!listRes.ok) throw new Error("Failed to fetch localizations");
  const listData = await listRes.json();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const existing = (listData.localizations ?? []).find(
    (l: any) => l.attributes.locale === locale,
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (!existing) return; // Already gone

  // Send with the locale in originalLocaleIds but NOT in locales → triggers delete
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locales: {},
      originalLocaleIds: { [locale]: existing.id },
    }),
  });

  const data = await res.json();
  if (data.errors?.length > 0) {
    throw new Error(data.errors[0].message);
  }
}
