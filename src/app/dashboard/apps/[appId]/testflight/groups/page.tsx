"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CircleNotch, LinkSimple, Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { CreateGroupDialog } from "@/components/create-group-dialog";
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
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { useApps } from "@/lib/apps-context";
import { useRegisterRefresh } from "@/lib/refresh-context";
import type { TFGroup } from "@/lib/asc/testflight";
import { useTranslations } from "@/lib/i18n/locale-context";

export default function GroupsPage() {
  const t = useTranslations();
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
        throw new Error(data.error ?? t("testflight.fetchGroupsFailed"));
      }
      const data = await res.json();
      setGroups(data.groups);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("testflight.fetchGroupsFailed"));
    } finally {
      setLoading(false);
    }
  }, [appId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => fetchData(true), [fetchData]);
  useRegisterRefresh({ onRefresh: handleRefresh, busy: loading });

  const internalGroups = groups.filter((g) => g.isInternal);
  const externalGroups = groups.filter((g) => !g.isInternal);

  if (!app) {
    return <EmptyState title={t("app.notFound")} />;
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <CircleNotch size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => fetchData()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1.5" />
          {t("testflight.newGroup")}
        </Button>
      </div>

      {internalGroups.length > 0 && (
        <section className="space-y-3">
          <h3 className="section-title">{t("testflight.internalGroups")}</h3>
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
                  <span>{t("testflight.testersCount", { count: group.testerCount })}</span>
                  <span>{t("testflight.buildsCount", { count: group.buildCount })}</span>
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
          <h3 className="section-title">{t("testflight.externalGroups")}</h3>
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
                  <span>{t("testflight.testersCount", { count: group.testerCount })}</span>
                  <span>{t("testflight.buildsCount", { count: group.buildCount })}</span>
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
            <AlertDialogTitle>
              {t("testflight.deleteGroupTitle", { name: deleteTarget?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("testflight.deleteGroupDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
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
  const t = useTranslations();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiFetch(`/api/apps/${appId}/testflight/groups/${groupId}`, {
        method: "DELETE",
      });
      toast.success(t("testflight.groupDeleted"));
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("testflight.deleteGroupFailed"));
      onError();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={deleting}>
      {deleting && <Spinner className="mr-1.5" />}
      {t("testflight.delete")}
    </AlertDialogAction>
  );
}
