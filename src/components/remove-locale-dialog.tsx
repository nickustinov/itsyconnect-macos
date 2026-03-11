"use client";

import { useState, useEffect } from "react";
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
import { useSeedSectionLocales } from "@/lib/section-locales-context";

export interface RemoveLocaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  appId: string;
  versionId: string;
  appInfoId: string;
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
  onRemoved,
}: RemoveLocaleDialogProps) {
  const [storeListing, setStoreListing] = useState(true);
  const [appDetails, setAppDetails] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState({ storeListing: false, appDetails: false });
  const { reset: resetSectionLocales } = useSeedSectionLocales();

  // Fetch fresh section data when dialog opens
  useEffect(() => {
    if (!open || !locale) return;
    setLoading(true);
    setError(null);

    async function check() {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const [versionRes, infoRes] = await Promise.all([
        fetch(`/api/apps/${appId}/versions/${versionId}/localizations?refresh`),
        fetch(`/api/apps/${appId}/info/${appInfoId}/localizations?refresh`),
      ]);

      const versionData = versionRes.ok ? await versionRes.json() : { localizations: [] };
      const infoData = infoRes.ok ? await infoRes.json() : { localizations: [] };

      const hasStoreListing = (versionData.localizations ?? []).some(
        (l: any) => l.attributes.locale === locale,
      );
      const hasAppDetails = (infoData.localizations ?? []).some(
        (l: any) => l.attributes.locale === locale,
      );
      /* eslint-enable @typescript-eslint/no-explicit-any */

      setSections({ storeListing: hasStoreListing, appDetails: hasAppDetails });
      setLoading(false);
    }

    check().catch(() => {
      setError("Failed to check locale sections");
      setLoading(false);
    });
  }, [open, locale, appId, versionId, appInfoId]);

  const sectionList = [
    { key: "storeListing", label: "Store listing", exists: sections.storeListing, checked: storeListing, setChecked: setStoreListing },
    { key: "appDetails", label: "App details", exists: sections.appDetails, checked: appDetails, setChecked: setAppDetails },
  ];

  const anyChecked = sectionList.some((s) => s.exists && s.checked);

  async function handleRemove() {
    setRemoving(true);
    setError(null);

    try {
      const promises: Promise<void>[] = [];

      if (storeListing && sections.storeListing) {
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

      // Reset cross-section locale cache so pickers refresh
      resetSectionLocales();
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

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Spinner className="size-5" />
          </div>
        ) : (
          <div className="space-y-1 py-2">
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
        )}

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
            disabled={loading || !anyChecked || removing}
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
