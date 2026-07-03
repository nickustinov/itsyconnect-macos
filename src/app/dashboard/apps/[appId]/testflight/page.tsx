"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { PaginatedList } from "@/components/paginated-list";
import { CircleNotch, CaretDown, Prohibit, Plus, Minus, Package } from "@phosphor-icons/react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { useApps } from "@/lib/apps-context";
import { usePreReleaseVersions } from "@/lib/pre-release-versions-context";
import { FooterPortal } from "@/lib/footer-portal-context";
import { BUILD_STATUS_DOTS } from "@/lib/asc/display-types";
import { resolvePreReleaseVersion, PLATFORM_LABELS } from "@/lib/asc/version-types";
import { useRegisterRefresh } from "@/lib/refresh-context";
import type { TFBuild, TFGroup } from "@/lib/asc/testflight";
import { formatDate } from "@/lib/format";
import { useTranslations } from "@/lib/i18n/locale-context";

export default function TestFlightBuildsPage() {
  const t = useTranslations();
  const { appId } = useParams<{ appId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { versions: preReleaseVersions, loading: versionsLoading, refresh: refreshVersions } = usePreReleaseVersions();

  const selectedVersion = resolvePreReleaseVersion(preReleaseVersions, searchParams.get("version"));
  const platform = selectedVersion?.platform;
  const versionString = selectedVersion?.version;

  const [builds, setBuilds] = useState<TFBuild[]>([]);
  const [groups, setGroups] = useState<TFGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [expireOpen, setExpireOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    setCurrentPage(1);
    try {
      const params = new URLSearchParams();
      if (forceRefresh) params.set("refresh", "1");
      if (platform) params.set("platform", platform);
      if (versionString) params.set("version", versionString);
      const qs = params.toString() ? `?${params}` : "";

      const [buildsRes, groupsRes] = await Promise.all([
        fetch(`/api/apps/${appId}/testflight/builds${qs}`),
        fetch(`/api/apps/${appId}/testflight/groups${forceRefresh ? "?refresh=1" : ""}`),
      ]);

      if (!buildsRes.ok) {
        const data = await buildsRes.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to fetch builds (${buildsRes.status})`);
      }

      const buildsData = await buildsRes.json();
      setBuilds(buildsData.builds);

      if (groupsRes.ok) {
        const groupsData = await groupsRes.json();
        setGroups(groupsData.groups);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("testflight.fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [appId, platform, versionString]);

  // Wait for versions to load before fetching builds (prevents double-fetch)
  useEffect(() => {
    if (!versionsLoading) fetchData();
  }, [fetchData, versionsLoading]);

  const handleRefresh = useCallback(async () => {
    await refreshVersions();
    await fetchData(true);
  }, [fetchData, refreshVersions]);
  useRegisterRefresh({ onRefresh: handleRefresh, busy: loading });

  // Stats
  const stats = useMemo(() => {
    const total = builds.length;
    const dates = builds.map((b) => new Date(b.uploadedDate).getTime());
    const firstDate = dates.length > 0 ? new Date(Math.min(...dates)) : null;
    const latestDate = dates.length > 0 ? new Date(Math.max(...dates)) : null;

    return { total, firstDate, latestDate };
  }, [builds]);

  // Pagination – compute current page slice for selection scoping
  const perPage = 20;
  const totalPages = Math.max(1, Math.ceil(builds.length / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageBuilds = builds.slice((safePage - 1) * perPage, safePage * perPage);

  // Selection helpers – scoped to current page
  const selectableBuilds = useMemo(
    () => pageBuilds.filter((b) => !b.expired),
    [pageBuilds],
  );

  const allSelected = selectableBuilds.length > 0 && selectableBuilds.every((b) => selected.has(b.id));
  const someSelected = selectableBuilds.some((b) => selected.has(b.id));

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const b of selectableBuilds) next.delete(b.id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const b of selectableBuilds) next.add(b.id);
        return next;
      });
    }
  }

  function toggleOne(buildId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(buildId)) next.delete(buildId);
      else next.add(buildId);
      return next;
    });
  }

  // Groups relevant to selected builds (for "remove from group")
  const selectedBuildGroupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const build of builds) {
      if (selected.has(build.id)) {
        for (const gid of build.groupIds) ids.add(gid);
      }
    }
    return ids;
  }, [builds, selected]);

  const relevantGroups = useMemo(
    () => groups.filter((g) => selectedBuildGroupIds.has(g.id)),
    [groups, selectedBuildGroupIds],
  );

  // Statuses that Apple allows expiring (matches BuildActionFooter logic)
  const expirableStatuses = new Set(["Testing", "Ready to test", "Ready to submit"]);

  // Bulk action handlers
  async function bulkExpire() {
    setBulkLoading(true);
    const eligible = builds.filter(
      (b) => selected.has(b.id) && expirableStatuses.has(b.status),
    );
    const skipped = selected.size - eligible.length;
    const results = await Promise.allSettled(
      eligible.map((b) =>
        apiFetch(`/api/apps/${appId}/testflight/builds/${b.id}/expire`, { method: "POST" }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0 && skipped === 0) {
      toast.success(ok === 1
        ? t("testflight.buildsExpired", { count: ok })
        : t("testflight.buildsExpiredPlural", { count: ok }));
    } else if (failed === 0) {
      toast.success(t("testflight.expiredWithSkipped", { ok, skipped }));
    } else {
      toast.error(t("testflight.expiredWithFailed", { ok, failed, skipped }));
    }
    setBulkLoading(false);
    setExpireOpen(false);
    fetchData(true);
  }

  async function bulkAddToGroup(groupId: string) {
    setBulkLoading(true);
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map((id) =>
        apiFetch(`/api/apps/${appId}/testflight/builds/${id}/groups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupIds: [groupId] }),
        }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      toast.success(ok === 1
        ? t("testflight.buildsAddedToGroup", { count: ok })
        : t("testflight.buildsAddedToGroupPlural", { count: ok }));
    } else {
      toast.error(t("testflight.addedWithFailed", { ok, failed }));
    }
    setBulkLoading(false);
    fetchData(true);
  }

  async function bulkRemoveFromGroup(groupId: string) {
    setBulkLoading(true);
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map((id) =>
        apiFetch(`/api/apps/${appId}/testflight/builds/${id}/groups`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupIds: [groupId] }),
        }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      toast.success(ok === 1
        ? t("testflight.buildsRemovedFromGroup", { count: ok })
        : t("testflight.buildsRemovedFromGroupPlural", { count: ok }));
    } else {
      toast.error(t("testflight.removedWithFailed", { ok, failed }));
    }
    setBulkLoading(false);
    fetchData(true);
  }

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

  if (builds.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title={t("testflight.noBuilds")}
        description={
          versionString
            ? `${t("testflight.noBuildsDescription")} (${versionString})`
            : t("testflight.noBuildsDescription")
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="flex items-center gap-6 text-sm">
        <div>
          <p className="text-muted-foreground">{t("testflight.totalBuilds")}</p>
          <p className="font-medium tabular-nums">{stats.total}</p>
        </div>
        <div className="h-8 border-l" />
        <div>
          <p className="text-muted-foreground">{t("testflight.firstBuild")}</p>
          <p className="font-medium tabular-nums">
            {stats.firstDate ? formatDate(stats.firstDate.toISOString()) : "–"}
          </p>
        </div>
        <div className="h-8 border-l" />
        <div>
          <p className="text-muted-foreground">{t("testflight.latest")}</p>
          <p className="font-medium tabular-nums">
            {stats.latestDate
              ? formatDate(stats.latestDate.toISOString())
              : "–"}
          </p>
        </div>
      </div>

      <PaginatedList
        items={builds}
        perPage={perPage}
        currentPage={currentPage}
        onPageChange={(page) => { setCurrentPage(page); setSelected(new Set()); }}
      >
        {(pageItems) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={t("testflight.selectAllBuilds")}
                  />
                </TableHead>
                <TableHead>{t("testflight.build")}</TableHead>
                <TableHead>{t("testflight.version")}</TableHead>
                <TableHead>{t("testflight.status")}</TableHead>
                <TableHead>{t("testflight.groups")}</TableHead>
                <TableHead className="text-right">{t("testflight.installs")}</TableHead>
                <TableHead className="text-right">{t("testflight.sessions")}</TableHead>
                <TableHead className="text-right">{t("testflight.crashes")}</TableHead>
                <TableHead className="text-right">{t("testflight.invites")}</TableHead>
                <TableHead className="text-right">{t("testflight.feedback")}</TableHead>
                <TableHead className="text-right">{t("testflight.uploaded")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((build) => {
                const buildGroups = groups.filter((g) =>
                  build.groupIds.includes(g.id),
                );

                return (
                  <TableRow
                    key={build.id}
                    className="cursor-pointer"
                    data-state={selected.has(build.id) ? "selected" : undefined}
                    onClick={() => {
                      const qs = searchParams.toString();
                      const url = `/dashboard/apps/${appId}/testflight/${build.id}${qs ? `?${qs}` : ""}`;
                      router.push(url);
                    }}
                  >
                    <TableCell>
                      {!build.expired && (
                        <Checkbox
                          checked={selected.has(build.id)}
                          onCheckedChange={() => toggleOne(build.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select build ${build.buildNumber}`}
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {build.buildNumber}
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="text-sm">{build.versionString}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {PLATFORM_LABELS[build.platform] ?? build.platform}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block size-2 shrink-0 rounded-full ${BUILD_STATUS_DOTS[build.status] ?? "bg-gray-400"}`}
                        />
                        <span className="text-sm">{build.status}</span>
                      </div>
                      {build.expired && build.expirationDate && (
                        <p className="text-xs text-muted-foreground">
                          {formatDate(build.expirationDate)}
                        </p>
                      )}
                      {!build.expired && build.expirationDate && build.status === "Testing" && (
                        <p className="text-xs text-muted-foreground">
                          {t("testflight.expiresOn", { date: formatDate(build.expirationDate) })}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {build.expired ? (
                        <span className="text-sm text-muted-foreground">&ndash;</span>
                      ) : buildGroups.length > 0 ? (
                        <div className="space-y-0.5">
                          {buildGroups.map((g) => (
                            <div key={g.id} className="flex items-center gap-1.5 text-sm">
                              <span className={`inline-flex size-4 items-center justify-center rounded text-[10px] font-medium ${g.isInternal ? "bg-muted text-muted-foreground" : "bg-blue-100 text-blue-700"}`}>
                                {g.isInternal ? "I" : "E"}
                              </span>
                              <span>{g.name}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">&ndash;</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {build.installs > 0 ? build.installs : "–"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {build.sessions > 0 ? build.sessions : "–"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {build.crashes > 0 ? build.crashes : "–"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {build.invites > 0 ? build.invites : "–"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {build.feedbackCount > 0 ? build.feedbackCount : "–"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatDate(build.uploadedDate)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </PaginatedList>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <FooterPortal>
          <div className="shrink-0 flex items-center justify-between border-t bg-sidebar px-6 py-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium">
                {selected.size === 1
                  ? t("testflight.buildsSelected", { count: selected.size })
                  : t("testflight.buildsSelectedPlural", { count: selected.size })}
              </span>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-muted-foreground"
                onClick={() => setSelected(new Set())}
              >
                {t("testflight.clear")}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={bulkLoading}>
                    <Plus size={14} className="mr-1.5" />
                    {t("testflight.addToGroup")}
                    <CaretDown size={12} className="ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {groups.map((g) => (
                    <DropdownMenuItem key={g.id} onClick={() => bulkAddToGroup(g.id)}>
                      {g.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setCreateGroupOpen(true)}>
                    <Plus size={14} className="text-muted-foreground" />
                    {t("testflight.addGroup")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkLoading || relevantGroups.length === 0}
                  >
                    <Minus size={14} className="mr-1.5" />
                    {t("testflight.removeFromGroup")}
                    <CaretDown size={12} className="ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {relevantGroups.map((g) => (
                    <DropdownMenuItem key={g.id} onClick={() => bulkRemoveFromGroup(g.id)}>
                      {g.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkLoading}
                onClick={() => setExpireOpen(true)}
              >
                {bulkLoading ? <Spinner className="mr-1.5" /> : <Prohibit size={14} className="mr-1.5" />}
                {t("testflight.expire")}
              </Button>
            </div>
          </div>
        </FooterPortal>
      )}

      <CreateGroupDialog
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        appId={appId}
        onCreated={() => fetchData(true)}
      />

      {/* Expire confirmation dialog */}
      <AlertDialog open={expireOpen} onOpenChange={setExpireOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selected.size === 1
                ? t("testflight.expireTitle", { count: selected.size })
                : t("testflight.expireTitlePlural", { count: selected.size })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selected.size === 1
                ? t("testflight.expireDescription")
                : t("testflight.expireDescriptionPlural")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={bulkExpire} disabled={bulkLoading}>
              {bulkLoading && <Spinner className="mr-1.5" />}
              {selected.size === 1
                ? t("testflight.expireBuild")
                : t("testflight.expireBuilds")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
