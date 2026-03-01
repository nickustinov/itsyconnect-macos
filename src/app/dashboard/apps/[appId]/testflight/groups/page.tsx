"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CircleNotch, ArrowClockwise, LinkSimple, Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { useApps } from "@/lib/apps-context";
import { useRegisterRefresh } from "@/lib/refresh-context";
import type { TFGroup } from "@/lib/asc/testflight";

export default function GroupsPage() {
  const { appId } = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);

  // Preserve sticky params (version) when navigating to group detail
  const versionParam = searchParams.get("version");
  const qs = versionParam ? `?version=${encodeURIComponent(versionParam)}` : "";

  const [groups, setGroups] = useState<TFGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TFGroup | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const qs = forceRefresh ? "?refresh=1" : "";
      const res = await fetch(`/api/apps/${appId}/testflight/groups${qs}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to fetch groups (${res.status})`);
      }
      const data = await res.json();
      setGroups(data.groups);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch groups");
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => fetchData(true), [fetchData]);
  useRegisterRefresh({ onRefresh: handleRefresh, busy: loading });

  const internalGroups = groups.filter((g) => g.isInternal);
  const externalGroups = groups.filter((g) => !g.isInternal);

  if (!app) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        App not found
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <CircleNotch size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-muted-foreground">
        <p>{error}</p>
        <Button variant="outline" size="sm" onClick={() => fetchData()}>
          <ArrowClockwise size={14} className="mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1.5" />
          New group
        </Button>
      </div>

      {internalGroups.length > 0 && (
        <section className="space-y-3">
          <h3 className="section-title">Internal groups</h3>
          <div className="rounded-lg border">
            {internalGroups.map((group, i) => (
              <Link
                key={group.id}
                href={`/dashboard/apps/${appId}/testflight/groups/${group.id}${qs}`}
                className={`flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/50 ${i > 0 ? "border-t" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-4 items-center justify-center rounded text-[10px] font-medium bg-muted text-muted-foreground">
                    I
                  </span>
                  <span className="text-sm font-medium">{group.name}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{group.testerCount} testers</span>
                  <span>{group.buildCount} builds</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteTarget(group);
                    }}
                  >
                    <Trash size={14} />
                  </Button>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {externalGroups.length > 0 && (
        <section className="space-y-3">
          <h3 className="section-title">External groups</h3>
          <div className="rounded-lg border">
            {externalGroups.map((group, i) => (
              <Link
                key={group.id}
                href={`/dashboard/apps/${appId}/testflight/groups/${group.id}${qs}`}
                className={`flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/50 ${i > 0 ? "border-t" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-4 items-center justify-center rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                    E
                  </span>
                  <span className="text-sm font-medium">{group.name}</span>
                  {group.publicLinkEnabled && (
                    <LinkSimple size={14} className="text-muted-foreground" />
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{group.testerCount} testers</span>
                  <span>{group.buildCount} builds</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteTarget(group);
                    }}
                  >
                    <Trash size={14} />
                  </Button>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <CreateGroupDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        appId={appId}
        onCreated={() => fetchData(true)}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the group and revoke tester access to its builds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <DeleteGroupAction
              appId={appId}
              groupId={deleteTarget?.id ?? ""}
              onDeleted={() => {
                setDeleteTarget(null);
                fetchData(true);
              }}
              onError={() => setDeleteTarget(null)}
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateGroupDialog({
  open,
  onOpenChange,
  appId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setIsInternal(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    try {
      await apiFetch(`/api/apps/${appId}/testflight/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), isInternal }),
      });
      toast.success(`Group "${name.trim()}" created`);
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <RadioGroup
            value={isInternal ? "internal" : "external"}
            onValueChange={(v) => setIsInternal(v === "internal")}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="external" id="type-external" />
              <Label htmlFor="type-external">External</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="internal" id="type-internal" />
              <Label htmlFor="type-internal">Internal</Label>
            </div>
          </RadioGroup>
          <Input
            placeholder="Group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || submitting}>
              {submitting && <Spinner className="mr-1.5" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteGroupAction({
  appId,
  groupId,
  onDeleted,
  onError,
}: {
  appId: string;
  groupId: string;
  onDeleted: () => void;
  onError: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiFetch(`/api/apps/${appId}/testflight/groups/${groupId}`, {
        method: "DELETE",
      });
      toast.success("Group deleted");
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete group");
      onError();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={deleting}>
      {deleting && <Spinner className="mr-1.5" />}
      Delete
    </AlertDialogAction>
  );
}
