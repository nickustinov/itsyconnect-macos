"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Archive,
  ArrowCounterClockwise,
  CircleNotch,
  Plus,
  Trash,
  Trophy,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useRegisterRefresh } from "@/lib/refresh-context";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import type {
  AscNomination,
  NominationType,
  NominationState,
} from "@/lib/asc/nominations";

// ── Helpers ──────────────────────────────────────────────────────────

const TYPE_LABELS: Record<NominationType, string> = {
  APP_LAUNCH: "App launch",
  APP_ENHANCEMENTS: "App enhancements",
  NEW_CONTENT: "New content",
};

const STATE_LABELS: Record<NominationState, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  ARCHIVED: "Archived",
};

const STATE_COLOURS: Record<NominationState, string> = {
  DRAFT: "bg-yellow-500",
  SUBMITTED: "bg-green-500",
  ARCHIVED: "bg-muted-foreground",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Page ─────────────────────────────────────────────────────────────

export default function NominationsPage() {
  const { appId } = useParams<{ appId: string }>();
  const router = useRouter();

  // Data
  const [nominations, setNominations] = useState<AscNomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [stateFilter, setStateFilter] = useState<string>("all");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<AscNomination | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Archive / unarchive
  const [archivingId, setArchivingId] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────

  const fetchNominations = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const qs = forceRefresh ? "?refresh=1" : "";
        const res = await fetch(`/api/nominations${qs}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.error ?? `Failed to fetch nominations (${res.status})`,
          );
        }
        const data = await res.json();
        setNominations(data.nominations);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch nominations",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchNominations();
  }, [fetchNominations]);

  const handleRefresh = useCallback(
    () => fetchNominations(true),
    [fetchNominations],
  );
  useRegisterRefresh({ onRefresh: handleRefresh, busy: loading });

  // ── Filter to current app ────────────────────────────────────────

  const appNominations = useMemo(
    () => nominations.filter((n) => n.relatedAppIds.includes(appId)),
    [nominations, appId],
  );

  const filtered = useMemo(() => {
    if (stateFilter === "all") return appNominations;
    return appNominations.filter((n) => n.attributes.state === stateFilter);
  }, [appNominations, stateFilter]);

  // ── Handlers ─────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/nominations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: deleteTarget.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete nomination");
      }
      toast.success("Nomination deleted");
      setDeleteTarget(null);
      await fetchNominations(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  async function handleArchiveToggle(nom: AscNomination) {
    const archive = nom.attributes.state !== "ARCHIVED";
    setArchivingId(nom.id);
    try {
      const res = await fetch("/api/nominations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: nom.id,
          attributes: { archived: archive },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to ${archive ? "archive" : "unarchive"}`);
      }
      toast.success(archive ? "Nomination archived" : "Nomination unarchived");
      await fetchNominations(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setArchivingId(null);
    }
  }

  // ── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <CircleNotch size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => fetchNominations()} />;
  }

  if (appNominations.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="No nominations"
        description={
          <>
            Nominate your app for featuring on the App Store to reach more users.
            <br /><br />
            <Button
              size="sm"
              onClick={() =>
                router.push(`/dashboard/apps/${appId}/nominations/new`)
              }
            >
              <Plus size={14} className="mr-1.5" />
              New nomination
            </Button>
          </>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-[150px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="SUBMITTED">Submitted</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          onClick={() =>
            router.push(`/dashboard/apps/${appId}/nominations/new`)
          }
        >
          <Plus size={14} className="mr-1.5" />
          New nomination
        </Button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No nominations match the current filter.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((nom) => (
            <Card
              key={nom.id}
              className="cursor-pointer gap-0 py-0 transition-colors hover:bg-muted/50"
              onClick={() =>
                router.push(
                  `/dashboard/apps/${appId}/nominations/${nom.id}`,
                )
              }
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">
                        {nom.attributes.name}
                      </h3>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {TYPE_LABELS[nom.attributes.type]}
                      </Badge>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={`size-2 rounded-full ${STATE_COLOURS[nom.attributes.state]}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {STATE_LABELS[nom.attributes.state]}
                        </span>
                      </div>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {nom.attributes.description}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        Publish: {formatDate(nom.attributes.publishStartDate)}
                        {nom.attributes.publishEndDate &&
                          ` – ${formatDate(nom.attributes.publishEndDate)}`}
                      </span>
                      {nom.attributes.submittedDate && (
                        <span>
                          Submitted: {formatDate(nom.attributes.submittedDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {nom.attributes.state === "SUBMITTED" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground"
                        disabled={archivingId === nom.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchiveToggle(nom);
                        }}
                      >
                        {archivingId === nom.id ? <CircleNotch size={14} className="animate-spin" /> : <Archive size={14} />}
                        Archive
                      </Button>
                    )}
                    {nom.attributes.state === "ARCHIVED" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground"
                        disabled={archivingId === nom.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchiveToggle(nom);
                        }}
                      >
                        {archivingId === nom.id ? <CircleNotch size={14} className="animate-spin" /> : <ArrowCounterClockwise size={14} />}
                        Unarchive
                      </Button>
                    )}
                    {nom.attributes.state === "DRAFT" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(nom);
                        }}
                      >
                        <Trash size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete nomination</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.attributes.name}
              &rdquo;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && (
                <CircleNotch size={14} className="mr-1.5 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
