"use client";

import { useEffect, useState } from "react";
import { ArrowClockwise, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export function UpdateBanner() {
  const [notes, setNotes] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unsub = window.electron?.updates.onStatus((status) => {
      if (status.state === "downloaded") {
        setNotes(status.notes ?? []);
        setReady(true);
        setDismissed(false);
      }
    });
    return () => { unsub?.(); };
  }, []);

  if (dismissed || !ready) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 w-80 rounded-lg border bg-popover p-4 shadow-lg">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium">Update available</h4>
        <button
          onClick={() => setDismissed(true)}
          className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>
      {notes.length > 0 && (
        <ul className="mb-4 space-y-1 text-xs text-muted-foreground">
          {notes.map((note, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          onClick={() => window.electron?.updates.installNow()}
        >
          <ArrowClockwise size={14} className="mr-1.5" />
          Restart to update
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDismissed(true)}
        >
          Later
        </Button>
      </div>
    </div>
  );
}
