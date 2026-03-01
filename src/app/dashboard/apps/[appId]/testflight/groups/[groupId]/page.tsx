"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { PaginatedList } from "@/components/paginated-list";
import { Copy, CircleNotch, Plus, UserPlus, MagnifyingGlass, Minus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useRegisterRefresh } from "@/lib/refresh-context";
import { useSetBreadcrumbTitle } from "@/lib/breadcrumb-context";
import { FooterPortal } from "@/lib/footer-portal-context";
import type { TFBuild, TFGroup, TFTester } from "@/lib/asc/testflight";
import { BUILD_STATUS_DOTS, TESTER_STATUS_DOTS } from "@/lib/asc/display-types";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/format";

const TESTER_STATUS_LABELS: Record<string, string> = {
  INSTALLED: "Installed",
  ACCEPTED: "Accepted",
  INVITED: "Invited",
  NOT_INVITED: "Not invited",
  REVOKED: "Revoked",
};

export default function GroupDetailPage() {
  const { appId, groupId } = useParams<{ appId: string; groupId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Preserve sticky params (version) when navigating to other TF pages
  const versionParam = searchParams.get("version");
  const qs = versionParam ? `?version=${encodeURIComponent(versionParam)}` : "";

  const [group, setGroup] = useState<TFGroup | null>(null);
  const [builds, setBuilds] = useState<TFBuild[]>([]);
  const [testers, setTesters] = useState<TFTester[]>([]);
  const [allAppBuilds, setAllAppBuilds] = useState<TFBuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buildsPage, setBuildsPage] = useState(1);
  const [testersPage, setTestersPage] = useState(1);

  // Selection state
  const [selectedBuilds, setSelectedBuilds] = useState<Set<string>>(new Set());
  const [selectedTesters, setSelectedTesters] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Add tester dialog
  const [testerDialogOpen, setTesterDialogOpen] = useState(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setBuildsPage(1);
    setTestersPage(1);
    setSelectedBuilds(new Set());
    setSelectedTesters(new Set());
    try {
      const qs = forceRefresh ? "?refresh=1" : "";
      const [groupRes, buildsRes] = await Promise.all([
        fetch(`/api/apps/${appId}/testflight/groups/${groupId}${qs}`),
        fetch(`/api/apps/${appId}/testflight/builds${qs}`),
      ]);
      if (!groupRes.ok) {
        const data = await groupRes.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to fetch group (${groupRes.status})`);
      }
      const data = await groupRes.json();
      setGroup(data.group);
      setBuilds(data.builds);
      setTesters(data.testers);

      if (buildsRes.ok) {
        const buildsData = await buildsRes.json();
        setAllAppBuilds(buildsData.builds ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch group");
    } finally {
      setLoading(false);
    }
  }, [appId, groupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => fetchData(true), [fetchData]);
  useRegisterRefresh({ onRefresh: handleRefresh, busy: loading });

  const [publicLinkEnabled, setPublicLinkEnabled] = useState(false);

  // Sync public link toggle with fetched group data
  useEffect(() => {
    if (group) setPublicLinkEnabled(group.publicLinkEnabled);
  }, [group]);

  useSetBreadcrumbTitle(group?.name ?? null);

  // Builds available to add, grouped by version (latest first)
  // allAppBuilds is already sorted by uploadedDate desc from the API
  const groupBuildIds = useMemo(() => new Set(builds.map((b) => b.id)), [builds]);
  const buildsByVersion = useMemo(() => {
    const filtered = allAppBuilds.filter((b) => !b.expired && !groupBuildIds.has(b.id));
    const map = new Map<string, TFBuild[]>();
    for (const b of filtered) {
      const v = b.versionString || "Unknown";
      const arr = map.get(v);
      if (arr) arr.push(b);
      else map.set(v, [b]);
    }
    return map;
  }, [allAppBuilds, groupBuildIds]);
  const versionKeys = useMemo(() => [...buildsByVersion.keys()], [buildsByVersion]);
  const latestVersion = versionKeys[0] ?? null;
  const olderVersions = versionKeys.slice(1);
  const hasAvailableBuilds = buildsByVersion.size > 0;

  // Add build handler
  const [addingBuild, setAddingBuild] = useState(false);
  async function addBuild(buildId: string) {
    setAddingBuild(true);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/groups/${groupId}/builds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildIds: [buildId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add build");
      }
      toast.success("Build added to group");
      fetchData(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add build");
    } finally {
      setAddingBuild(false);
    }
  }

  // Bulk remove builds
  async function bulkRemoveBuilds() {
    setBulkLoading(true);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/groups/${groupId}/builds`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildIds: [...selectedBuilds] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to remove builds");
      }
      toast.success(`${selectedBuilds.size} build${selectedBuilds.size !== 1 ? "s" : ""} removed from group`);
      fetchData(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove builds");
    } finally {
      setBulkLoading(false);
    }
  }

  // Bulk remove testers
  async function bulkRemoveTesters() {
    setBulkLoading(true);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/groups/${groupId}/testers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: [...selectedTesters] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to remove testers");
      }
      toast.success(`${selectedTesters.size} tester${selectedTesters.size !== 1 ? "s" : ""} removed from group`);
      fetchData(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove testers");
    } finally {
      setBulkLoading(false);
    }
  }

  // Build selection helpers – scoped to current page
  const buildsPerPage = 10;
  const totalBuildsPages = Math.max(1, Math.ceil(builds.length / buildsPerPage));
  const safeBuildsPage = Math.min(buildsPage, totalBuildsPages);
  const pageBuilds = builds.slice((safeBuildsPage - 1) * buildsPerPage, safeBuildsPage * buildsPerPage);

  const allBuildsSelected = pageBuilds.length > 0 && pageBuilds.every((b) => selectedBuilds.has(b.id));
  const someBuildsSelected = pageBuilds.some((b) => selectedBuilds.has(b.id));

  function toggleAllBuilds() {
    setSelectedTesters(new Set());
    if (allBuildsSelected) {
      setSelectedBuilds((prev) => {
        const next = new Set(prev);
        for (const b of pageBuilds) next.delete(b.id);
        return next;
      });
    } else {
      setSelectedBuilds((prev) => {
        const next = new Set(prev);
        for (const b of pageBuilds) next.add(b.id);
        return next;
      });
    }
  }

  function toggleBuild(buildId: string) {
    setSelectedTesters(new Set());
    setSelectedBuilds((prev) => {
      const next = new Set(prev);
      if (next.has(buildId)) next.delete(buildId);
      else next.add(buildId);
      return next;
    });
  }

  // Tester selection helpers – scoped to current page
  const testersPerPage = 10;
  const totalTestersPages = Math.max(1, Math.ceil(testers.length / testersPerPage));
  const safeTestersPage = Math.min(testersPage, totalTestersPages);
  const pageTesters = testers.slice((safeTestersPage - 1) * testersPerPage, safeTestersPage * testersPerPage);

  const allTestersSelected = pageTesters.length > 0 && pageTesters.every((t) => selectedTesters.has(t.id));
  const someTestersSelected = pageTesters.some((t) => selectedTesters.has(t.id));

  function toggleAllTesters() {
    setSelectedBuilds(new Set());
    if (allTestersSelected) {
      setSelectedTesters((prev) => {
        const next = new Set(prev);
        for (const t of pageTesters) next.delete(t.id);
        return next;
      });
    } else {
      setSelectedTesters((prev) => {
        const next = new Set(prev);
        for (const t of pageTesters) next.add(t.id);
        return next;
      });
    }
  }

  function toggleTester(testerId: string) {
    setSelectedBuilds(new Set());
    setSelectedTesters((prev) => {
      const next = new Set(prev);
      if (next.has(testerId)) next.delete(testerId);
      else next.add(testerId);
      return next;
    });
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

  if (!group) {
    return <EmptyState title="Group not found" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className={`inline-flex size-5 items-center justify-center rounded text-xs font-medium ${group.isInternal ? "bg-muted text-muted-foreground" : "bg-blue-100 text-blue-700"}`}>
            {group.isInternal ? "I" : "E"}
          </span>
          <h1 className="text-2xl font-bold tracking-tight">{group.name}</h1>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <p className="text-muted-foreground">Testers</p>
            <p className="font-medium tabular-nums">{testers.length}</p>
          </div>
          <div className="h-8 border-l" />
          <div>
            <p className="text-muted-foreground">Builds</p>
            <p className="font-medium tabular-nums">{builds.length}</p>
          </div>
        </div>
      </div>

      {/* Public link */}
      {!group.isInternal && (
        <section className="space-y-3">
          <h3 className="section-title">Public link</h3>
          <div className="flex items-center gap-3">
            <Switch
              id="public-link"
              checked={publicLinkEnabled}
              onCheckedChange={setPublicLinkEnabled}
            />
            <Label htmlFor="public-link" className="text-sm">
              {publicLinkEnabled ? "Enabled" : "Disabled"}
            </Label>
          </div>
          {publicLinkEnabled && group.publicLink && (
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border bg-muted/50 px-3 py-2 font-mono text-sm text-muted-foreground">
                {group.publicLink}
              </code>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(group.publicLink!);
                  toast.success("Link copied to clipboard");
                }}
              >
                <Copy size={16} />
              </Button>
            </div>
          )}
        </section>
      )}

      {/* Builds */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="section-title">Builds</h3>
          {hasAvailableBuilds && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={addingBuild}>
                  <Plus size={14} className="mr-1.5" />
                  Add build
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 max-h-80 overflow-y-auto">
                {latestVersion && (
                  <>
                    <DropdownMenuLabel>Version {latestVersion}</DropdownMenuLabel>
                    {buildsByVersion.get(latestVersion)!.map((b) => (
                      <BuildDropdownItem key={b.id} build={b} onSelect={addBuild} />
                    ))}
                  </>
                )}
                {olderVersions.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Older versions</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-72 max-h-72 overflow-y-auto">
                        {olderVersions.map((version) => (
                          <div key={version}>
                            <DropdownMenuLabel>Version {version}</DropdownMenuLabel>
                            {buildsByVersion.get(version)!.map((b) => (
                              <BuildDropdownItem key={b.id} build={b} onSelect={addBuild} />
                            ))}
                          </div>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {builds.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No builds assigned to this group.
          </div>
        ) : (
          <PaginatedList
            items={builds}
            perPage={buildsPerPage}
            currentPage={buildsPage}
            onPageChange={(page) => { setBuildsPage(page); setSelectedBuilds(new Set()); }}
          >
            {(pageItems) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allBuildsSelected ? true : someBuildsSelected ? "indeterminate" : false}
                        onCheckedChange={toggleAllBuilds}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Select all builds"
                      />
                    </TableHead>
                    <TableHead className="w-24">Build</TableHead>
                    <TableHead className="w-24">Version</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-20 text-right">Sessions</TableHead>
                    <TableHead className="w-20 text-right">Crashes</TableHead>
                    <TableHead className="w-28 text-right">Uploaded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((build) => (
                    <TableRow
                      key={build.id}
                      className="cursor-pointer"
                      data-state={selectedBuilds.has(build.id) ? "selected" : undefined}
                      onClick={() =>
                        router.push(
                          `/dashboard/apps/${appId}/testflight/${build.id}${qs}`,
                        )
                      }
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedBuilds.has(build.id)}
                          onCheckedChange={() => toggleBuild(build.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select build ${build.buildNumber}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {build.buildNumber}
                      </TableCell>
                      <TableCell className="text-sm">
                        {build.versionString}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block size-2 shrink-0 rounded-full ${BUILD_STATUS_DOTS[build.status] ?? "bg-gray-400"}`}
                          />
                          <span className="text-sm">{build.status}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {build.sessions > 0 ? build.sessions : "\u2013"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {build.crashes > 0 ? build.crashes : "\u2013"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatDate(build.uploadedDate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </PaginatedList>
        )}
      </section>

      {/* Testers table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="section-title">Testers</h3>
          <Button variant="outline" size="sm" onClick={() => setTesterDialogOpen(true)}>
            <UserPlus size={14} className="mr-1.5" />
            Add tester
          </Button>
        </div>
        {testers.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No testers in this group yet.
          </div>
        ) : (
          <PaginatedList
            items={testers}
            perPage={testersPerPage}
            currentPage={testersPage}
            onPageChange={(page) => { setTestersPage(page); setSelectedTesters(new Set()); }}
          >
            {(pageItems) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allTestersSelected ? true : someTestersSelected ? "indeterminate" : false}
                        onCheckedChange={toggleAllTesters}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Select all testers"
                      />
                    </TableHead>
                    <TableHead>Tester</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-20 text-right">Sessions</TableHead>
                    <TableHead className="w-20 text-right">Crashes</TableHead>
                    <TableHead className="w-20 text-right">Feedback</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((tester) => {
                    const isPublicLink = tester.inviteType === "PUBLIC_LINK";
                    return (
                      <TableRow
                        key={tester.id}
                        data-state={selectedTesters.has(tester.id) ? "selected" : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedTesters.has(tester.id)}
                            onCheckedChange={() => toggleTester(tester.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select tester ${tester.firstName} ${tester.lastName}`}
                          />
                        </TableCell>
                        <TableCell>
                          {isPublicLink ? (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">
                                Anonymous
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Public link
                              </p>
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm font-medium">
                                {tester.firstName} {tester.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {tester.email}
                              </p>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block size-2 shrink-0 rounded-full ${TESTER_STATUS_DOTS[tester.state] ?? "bg-gray-400"}`}
                            />
                            <span className="text-sm">
                              {TESTER_STATUS_LABELS[tester.state] ?? tester.state}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {tester.sessions > 0 ? tester.sessions : "\u2013"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {tester.crashes > 0 ? tester.crashes : "\u2013"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {tester.feedbackCount > 0 ? tester.feedbackCount : "\u2013"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </PaginatedList>
        )}
      </section>

      {/* Bulk action bar – builds */}
      {selectedBuilds.size > 0 && (
        <FooterPortal>
          <div className="shrink-0 flex items-center justify-between border-t bg-sidebar px-6 py-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium">
                {selectedBuilds.size} build{selectedBuilds.size !== 1 ? "s" : ""} selected
              </span>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-muted-foreground"
                onClick={() => setSelectedBuilds(new Set())}
              >
                Clear
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={bulkLoading}
              onClick={bulkRemoveBuilds}
            >
              {bulkLoading ? <Spinner className="mr-1.5" /> : <Minus size={14} className="mr-1.5" />}
              Remove from group
            </Button>
          </div>
        </FooterPortal>
      )}

      {/* Bulk action bar – testers */}
      {selectedTesters.size > 0 && (
        <FooterPortal>
          <div className="shrink-0 flex items-center justify-between border-t bg-sidebar px-6 py-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium">
                {selectedTesters.size} tester{selectedTesters.size !== 1 ? "s" : ""} selected
              </span>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-muted-foreground"
                onClick={() => setSelectedTesters(new Set())}
              >
                Clear
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={bulkLoading}
              onClick={bulkRemoveTesters}
            >
              {bulkLoading ? <Spinner className="mr-1.5" /> : <Minus size={14} className="mr-1.5" />}
              Remove from group
            </Button>
          </div>
        </FooterPortal>
      )}

      {/* Add tester dialog */}
      <AddTesterDialog
        open={testerDialogOpen}
        onOpenChange={setTesterDialogOpen}
        appId={appId}
        groupId={groupId}
        existingTesterIds={testers.map((t) => t.id)}
        onAdded={() => fetchData(true)}
      />
    </div>
  );
}

// ── Build dropdown item ───────────────────────────────────────────

function BuildDropdownItem({
  build,
  onSelect,
}: {
  build: TFBuild;
  onSelect: (buildId: string) => void;
}) {
  return (
    <DropdownMenuItem onClick={() => onSelect(build.id)}>
      <div className="flex w-full items-center gap-3">
        <span className="font-medium tabular-nums">{build.buildNumber}</span>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block size-2 shrink-0 rounded-full ${BUILD_STATUS_DOTS[build.status] ?? "bg-gray-400"}`}
          />
          <span className="text-xs text-muted-foreground">{build.status}</span>
        </div>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {formatDate(build.uploadedDate)}
        </span>
      </div>
    </DropdownMenuItem>
  );
}

// ── Add tester dialog ─────────────────────────────────────────────

function AddTesterDialog({
  open,
  onOpenChange,
  appId,
  groupId,
  existingTesterIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  groupId: string;
  existingTesterIds: string[];
  onAdded: () => void;
}) {
  const [appTesters, setAppTesters] = useState<TFTester[]>([]);
  const [loadingTesters, setLoadingTesters] = useState(false);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const existingSet = useMemo(() => new Set(existingTesterIds), [existingTesterIds]);

  // Fetch app-level testers when dialog opens
  useEffect(() => {
    if (!open) return;
    setSearch("");

    setLoadingTesters(true);
    fetch(`/api/apps/${appId}/testflight/groups/${groupId}/testers?scope=app`)
      .then((res) => res.ok ? res.json() : { testers: [] })
      .then((data) => setAppTesters(data.testers ?? []))
      .catch(() => setAppTesters([]))
      .finally(() => setLoadingTesters(false));
  }, [open, appId, groupId]);

  const filteredTesters = useMemo(() => {
    const available = appTesters.filter((t) => !existingSet.has(t.id));
    if (!search) return available;
    const q = search.toLowerCase();
    return available.filter(
      (t) =>
        t.firstName.toLowerCase().includes(q) ||
        t.lastName.toLowerCase().includes(q) ||
        (t.email?.toLowerCase().includes(q) ?? false),
    );
  }, [appTesters, existingSet, search]);

  async function addExisting(testerId: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/groups/${groupId}/testers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: [testerId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add tester");
      }
      toast.success("Tester added to group");
      onAdded();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add tester");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add tester to group</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search testers…"
              className="pl-8"
            />
          </div>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {loadingTesters ? (
              <div className="flex items-center justify-center py-8">
                <CircleNotch size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : filteredTesters.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {search ? "No matching testers" : "No available testers"}
              </p>
            ) : (
              filteredTesters.map((t) => (
                <button
                  key={t.id}
                  onClick={() => addExisting(t.id)}
                  disabled={submitting}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {t.firstName} {t.lastName}
                    </p>
                    {t.email && (
                      <p className="truncate text-xs text-muted-foreground">
                        {t.email}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
