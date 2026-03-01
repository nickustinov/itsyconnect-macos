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
import { PaginatedList } from "@/components/paginated-list";
import { CircleNotch, CaretDown, Prohibit, Plus, Minus, Package } from "@phosphor-icons/react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { FooterPortal } from "@/lib/footer-portal-context";
import { BUILD_STATUS_DOTS } from "@/lib/asc/display-types";
import { resolveVersion, PLATFORM_LABELS } from "@/lib/asc/version-types";
import { useRegisterRefresh } from "@/lib/refresh-context";
import type { TFBuild, TFGroup } from "@/lib/asc/testflight";
import { formatDate } from "@/lib/format";

export default function TestFlightBuildsPage() {
  const { appId } = useParams<{ appId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const { versions, loading: versionsLoading } = useVersions();

  const selectedVersion = resolveVersion(versions, searchParams.get("version"));
  const platform = selectedVersion?.attributes.platform;
  const versionString = selectedVersion?.attributes.versionString;

  const [builds, setBuilds] = useState<TFBuild[]>([]);
  const [groups, setGroups] = useState<TFGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [expireOpen, setExpireOpen] = useState(false);
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
      setError(err instanceof Error ? err.message : "Failed to fetch builds");
    } finally {
      setLoading(false);
    }
  }, [appId, platform, versionString]);

  // Wait for versions to load before fetching builds (prevents double-fetch)
  useEffect(() => {
    if (!versionsLoading) fetchData();
  }, [fetchData, versionsLoading]);

  const handleRefresh = useCallback(() => fetchData(true), [fetchData]);
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
      toast.success(`${ok} build${ok !== 1 ? "s" : ""} expired`);
    } else if (failed === 0) {
      toast.success(`${ok} expired, ${skipped} skipped (not eligible)`);
    } else {
      toast.error(`${ok} expired, ${failed} failed, ${skipped} skipped`);
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
      toast.success(`${ok} build${ok !== 1 ? "s" : ""} added to group`);
    } else {
      toast.error(`${ok} added, ${failed} failed`);
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
      toast.success(`${ok} build${ok !== 1 ? "s" : ""} removed from group`);
    } else {
      toast.error(`${ok} removed, ${failed} failed`);
    }
    setBulkLoading(false);
    fetchData(true);
  }

  if (!app) {
    return <EmptyState title="App not found" />;
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
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => fetchData()}>
          Retry
        </Button>
      </div>
    );
  }

  if (builds.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No builds"
        description={
          versionString
            ? `No builds found for version ${versionString}. Upload a build from Xcode to see it here.`
            : "Upload a build from Xcode to see it here."
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="flex items-center gap-6 text-sm">
        <div>
          <p className="text-muted-foreground">Total builds</p>
          <p className="font-medium tabular-nums">{stats.total}</p>
        </div>
        <div className="h-8 border-l" />
        <div>
          <p className="text-muted-foreground">First build</p>
          <p className="font-medium tabular-nums">
            {stats.firstDate ? formatDate(stats.firstDate.toISOString()) : "–"}
          </p>
        </div>
        <div className="h-8 border-l" />
        <div>
          <p className="text-muted-foreground">Latest</p>
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
                    aria-label="Select all builds"
                  />
                </TableHead>
                <TableHead>Build</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Groups</TableHead>
                <TableHead className="text-right">Installs</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Crashes</TableHead>
                <TableHead className="text-right">Uploaded</TableHead>
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
                          Expires {formatDate(build.expirationDate)}
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
                      {build.expired ? "–" : build.installs > 0 ? build.installs : "–"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {build.expired ? "–" : build.sessions > 0 ? build.sessions : "–"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {build.expired ? "–" : build.crashes > 0 ? build.crashes : "–"}
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
                {selected.size} build{selected.size !== 1 ? "s" : ""} selected
              </span>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-muted-foreground"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={bulkLoading}>
                    <Plus size={14} className="mr-1.5" />
                    Add to group
                    <CaretDown size={12} className="ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {groups.map((g) => (
                    <DropdownMenuItem key={g.id} onClick={() => bulkAddToGroup(g.id)}>
                      {g.name}
                    </DropdownMenuItem>
                  ))}
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
                    Remove from group
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
                Expire
              </Button>
            </div>
          </div>
        </FooterPortal>
      )}

      {/* Expire confirmation dialog */}
      <AlertDialog open={expireOpen} onOpenChange={setExpireOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Expire {selected.size} build{selected.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This is irreversible. Testers will no longer be able to install {selected.size === 1 ? "this build" : "these builds"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={bulkExpire} disabled={bulkLoading}>
              {bulkLoading && <Spinner className="mr-1.5" />}
              Expire {selected.size === 1 ? "build" : "builds"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
