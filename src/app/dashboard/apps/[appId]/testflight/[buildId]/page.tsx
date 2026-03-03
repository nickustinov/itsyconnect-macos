"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CircleNotch, Plus, X, UserPlus, MagnifyingGlass, CaretRight } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useRegisterRefresh } from "@/lib/refresh-context";
import { useSetBreadcrumbTitle } from "@/lib/breadcrumb-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import { AppIcon } from "@/components/app-icon";
import { CharCount } from "@/components/char-count";
import { useBuildAction } from "@/lib/build-action-context";
import type { TFBuild, TFGroup, TFTester, TFDiagnosticSignature, TFDiagnosticLog, TFDiagnosticType, TFCallStackFrame } from "@/lib/asc/testflight";
import { BUILD_STATUS_DOTS, DIAGNOSTIC_TYPE_DOTS } from "@/lib/asc/display-types";
import { DIAGNOSTIC_TYPE_LABELS } from "@/lib/asc/testflight/types";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/format";

export default function BuildDetailPage() {
  const { appId, buildId } = useParams<{ appId: string; buildId: string }>();
  const searchParams = useSearchParams();

  // Preserve sticky params (version) when navigating to other TF pages
  const versionParam = searchParams.get("version");
  const qs = versionParam ? `?version=${encodeURIComponent(versionParam)}` : "";

  const [build, setBuild] = useState<TFBuild | null>(null);
  const [groups, setGroups] = useState<TFGroup[]>([]);
  const [testers, setTesters] = useState<TFTester[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [whatsNew, setWhatsNew] = useState("");

  const { setDirty, registerSave, registerDiscard } = useFormDirty();
  const { report: reportBuildAction, clear: clearBuildAction, registerRefresh, registerSave: registerBuildSave } = useBuildAction();

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const qs = forceRefresh ? "?refresh=1" : "";
      const [buildRes, groupsRes, testersRes] = await Promise.all([
        fetch(`/api/apps/${appId}/testflight/builds/${buildId}${qs}`),
        fetch(`/api/apps/${appId}/testflight/groups${qs}`),
        fetch(`/api/apps/${appId}/testflight/builds/${buildId}/testers`),
      ]);

      if (!buildRes.ok) {
        const data = await buildRes.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to fetch build (${buildRes.status})`);
      }

      const buildData = await buildRes.json();
      setBuild(buildData.build);
      setWhatsNew(buildData.build.whatsNew ?? "");

      if (groupsRes.ok) {
        const groupsData = await groupsRes.json();
        setGroups(groupsData.groups);
      }

      if (testersRes.ok) {
        const testersData = await testersRes.json();
        setTesters(testersData.testers ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch build");
    } finally {
      setLoading(false);
    }
  }, [appId, buildId]);

  // Refetch just testers (lightweight, no full page reload)
  const refetchTesters = useCallback(async () => {
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}/testers`);
      if (res.ok) {
        const data = await res.json();
        setTesters(data.testers ?? []);
      }
    } catch { /* best-effort */ }
  }, [appId, buildId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => fetchData(true), [fetchData]);
  useRegisterRefresh({ onRefresh: handleRefresh, busy: loading });
  useSetBreadcrumbTitle(build ? `Build ${build.buildNumber}` : null);

  // Report build state to footer context
  useEffect(() => {
    if (build) {
      const hasExternalGroup = build.groupIds.some(
        (gid) => groups.find((g) => g.id === gid && !g.isInternal),
      );
      reportBuildAction({
        appId,
        buildId,
        status: build.status,
        hasWhatsNew: (whatsNew?.length ?? 0) > 0,
        hasExternalGroup,
        whatsNew,
        localizationId: build.whatsNewLocalizationId,
      });
    }
    return () => clearBuildAction();
  }, [appId, buildId, build, groups, whatsNew, reportBuildAction, clearBuildAction]);

  useEffect(() => {
    registerRefresh(() => fetchData(true));
  }, [registerRefresh, fetchData]);

  // Register save for footer's "submit for review" auto-save
  useEffect(() => {
    registerBuildSave(async () => {
      if (!build?.whatsNewLocalizationId) return;
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsNew,
          localizationId: build.whatsNewLocalizationId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save what's new");
      }
      setBuild((prev) => prev ? { ...prev, whatsNew } : prev);
      setDirty(false);
    });
  }, [appId, buildId, build, whatsNew, registerBuildSave, setDirty]);

  const buildGroups = useMemo(
    () =>
      build
        ? groups.filter((g) => build.groupIds.includes(g.id))
        : [],
    [build, groups],
  );

  const availableGroups = useMemo(
    () =>
      build
        ? groups.filter((g) => !build.groupIds.includes(g.id))
        : [],
    [build, groups],
  );

  const [mountTime] = useState(() => Date.now());
  const daysUntilExpiry = useMemo(() => {
    if (!build?.expirationDate || build.expired) return null;
    const expiry = new Date(build.expirationDate).getTime();
    if (expiry <= mountTime) return null;
    return Math.ceil((expiry - mountTime) / (1000 * 60 * 60 * 24));
  }, [build, mountTime]);

  // Register save handler for the header save button
  useEffect(() => {
    registerSave(async () => {
      if (!build?.whatsNewLocalizationId) {
        toast.error("Cannot save – no localization ID available");
        return;
      }
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsNew,
          localizationId: build.whatsNewLocalizationId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      toast.success("What's new saved");
      setBuild((prev) => prev ? { ...prev, whatsNew } : prev);
      setDirty(false);
    });
  }, [appId, buildId, build, whatsNew, registerSave, setDirty]);

  // Register discard handler for the header discard button
  useEffect(() => {
    registerDiscard(() => {
      setWhatsNew(build?.whatsNew ?? "");
    });
  }, [build, registerDiscard]);

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

  if (!build) {
    return <EmptyState title="Build not found" />;
  }

  const isExpired = build.expired;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AppIcon iconUrl={build.iconUrl} name={`Build ${build.buildNumber}`} className="size-10" iconSize={20} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Build {build.buildNumber}
            </h1>
            <p className="text-sm text-muted-foreground">
              {build.versionString}
              {daysUntilExpiry !== null && (
                <span className="ml-2">
                  · Expires in {daysUntilExpiry} days
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block size-2 shrink-0 rounded-full ${BUILD_STATUS_DOTS[build.status] ?? "bg-gray-400"}`}
          />
          <span className="text-sm font-medium">{build.status}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-6 text-sm">
        <div>
          <p className="text-muted-foreground">Created</p>
          <p className="font-medium tabular-nums">
            {formatDateTime(build.uploadedDate)}
          </p>
        </div>
        <div className="h-8 border-l" />
        <div>
          <p className="text-muted-foreground">Installs</p>
          <p className="font-medium tabular-nums">{build.installs}</p>
        </div>
        <div className="h-8 border-l" />
        <div>
          <p className="text-muted-foreground">Sessions</p>
          <p className="font-medium tabular-nums">{build.sessions}</p>
        </div>
        <div className="h-8 border-l" />
        <div>
          <p className="text-muted-foreground">Crashes</p>
          <p className="font-medium tabular-nums">{build.crashes}</p>
        </div>
        <div className="h-8 border-l" />
        <div>
          <p className="text-muted-foreground">Invites</p>
          <p className="font-medium tabular-nums">{build.invites}</p>
        </div>
        <div className="h-8 border-l" />
        <div>
          <p className="text-muted-foreground">Feedback</p>
          <p className="font-medium tabular-nums">{build.feedbackCount}</p>
        </div>
      </div>

      {/* What's new */}
      <section className="space-y-2">
        <h3 className="section-title">What&apos;s new</h3>
        <Card className="gap-0 py-0">
          <CardContent className="px-5 py-4">
            <Textarea
              value={whatsNew}
              readOnly={isExpired}
              onChange={isExpired ? undefined : (e) => {
                setWhatsNew(e.target.value);
                setDirty(e.target.value !== (build.whatsNew ?? ""));
              }}
              placeholder="Describe what's new in this build…"
              className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none text-sm min-h-0 dark:bg-transparent"
            />
          </CardContent>
          {!isExpired && (
            <div className="flex items-center rounded-b-xl border-t bg-sidebar px-3 py-1.5">
              <CharCount value={whatsNew} limit={4000} />
            </div>
          )}
        </Card>
      </section>

      {!isExpired && (
        <>
          {/* Groups */}
          <GroupsSection
            appId={appId}
            buildId={buildId}
            buildGroups={buildGroups}
            availableGroups={availableGroups}
            onGroupAdded={(groupId) => {
              setBuild((prev) => prev ? { ...prev, groupIds: [...prev.groupIds, groupId] } : prev);
            }}
            onGroupRemoved={(groupId) => {
              setBuild((prev) => prev ? { ...prev, groupIds: prev.groupIds.filter((id) => id !== groupId) } : prev);
            }}
            onGroupsChanged={() => fetchData(true)}
            linkSuffix={qs}
          />

          {/* Testers */}
          <TestersSection
            appId={appId}
            buildId={buildId}
            testers={testers}
            onRemoved={refetchTesters}
            onTesterAdded={(tester) => setTesters((prev) => [...prev, tester])}
          />
        </>
      )}

      {/* Diagnostics – only available for iOS/iPadOS builds */}
      {build.platform === "IOS" && (
        <DiagnosticsSection appId={appId} buildId={buildId} />
      )}
    </div>
  );
}

// ── Diagnostics section ───────────────────────────────────────────

function DiagnosticsSection({ appId, buildId }: { appId: string; buildId: string }) {
  const [signatures, setSignatures] = useState<TFDiagnosticSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, TFDiagnosticLog[]>>({});
  const [logsLoading, setLogsLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/apps/${appId}/testflight/builds/${buildId}/diagnostics`)
      .then((res) => (res.ok ? res.json() : { signatures: [] }))
      .then((data) => setSignatures(data.signatures ?? []))
      .catch(() => setSignatures([]))
      .finally(() => setLoading(false));
  }, [appId, buildId]);

  const filtered = useMemo(() => {
    if (activeTab === "all") return signatures;
    return signatures.filter((s) => s.diagnosticType === activeTab);
  }, [signatures, activeTab]);

  const maxWeight = useMemo(
    () => Math.max(...filtered.map((s) => s.weight), 1),
    [filtered],
  );

  async function toggleExpand(signatureId: string) {
    if (expandedId === signatureId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(signatureId);

    if (!logs[signatureId]) {
      setLogsLoading(signatureId);
      try {
        const res = await fetch(
          `/api/apps/${appId}/testflight/builds/${buildId}/diagnostics/${signatureId}/logs`,
        );
        if (res.ok) {
          const data = await res.json();
          setLogs((prev) => ({ ...prev, [signatureId]: data.logs ?? [] }));
        }
      } catch {
        /* best-effort */
      } finally {
        setLogsLoading(null);
      }
    }
  }

  if (loading) {
    return (
      <section className="space-y-3">
        <h3 className="section-title">Diagnostics</h3>
        <div className="flex items-center justify-center py-8">
          <CircleNotch size={20} className="animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="section-title">Diagnostics</h3>

      {signatures.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No diagnostic signatures for this build.
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList variant="line">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="DISK_WRITES">Disk writes</TabsTrigger>
            <TabsTrigger value="HANGS">Hangs</TabsTrigger>
            <TabsTrigger value="LAUNCHES">Launches</TabsTrigger>
          </TabsList>

          {["all", "DISK_WRITES", "HANGS", "LAUNCHES"].map((tab) => (
            <TabsContent key={tab} value={tab}>
              {filtered.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No {tab === "all" ? "diagnostic" : DIAGNOSTIC_TYPE_LABELS[tab as TFDiagnosticType]?.toLowerCase()} signatures.
                </div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((sig) => (
                    <div key={sig.id}>
                      <button
                        className="flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/50"
                        onClick={() => toggleExpand(sig.id)}
                      >
                        <CaretRight
                          size={14}
                          className={`shrink-0 text-muted-foreground transition-transform ${expandedId === sig.id ? "rotate-90" : ""}`}
                        />
                        <span
                          className={`inline-block size-2 shrink-0 rounded-full ${DIAGNOSTIC_TYPE_DOTS[sig.diagnosticType] ?? "bg-gray-400"}`}
                        />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {sig.signature}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-foreground/30"
                              style={{ width: `${(sig.weight / maxWeight) * 100}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                            {Math.round(sig.weight * 100)}%
                          </span>
                        </div>
                      </button>

                      {expandedId === sig.id && (
                        <div className="ml-6 border-l pl-4 pt-2 pb-3">
                          {logsLoading === sig.id ? (
                            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                              <CircleNotch size={14} className="animate-spin" />
                              Loading logs…
                            </div>
                          ) : (logs[sig.id] ?? []).length === 0 ? (
                            <p className="py-4 text-sm text-muted-foreground">
                              No logs available for this signature.
                            </p>
                          ) : (
                            <div className="space-y-4">
                              {(logs[sig.id] ?? []).map((log, logIdx) => (
                                <div key={logIdx} className="space-y-2">
                                  {Object.keys(log.metadata).length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                      {Object.entries(log.metadata).map(([k, v]) => (
                                        <span key={k} className="rounded bg-muted px-2 py-0.5 text-xs">
                                          {k}: {v}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {log.callStack.length > 0 && (
                                    <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed">
                                      {renderCallStack(log.callStack, 0)}
                                    </pre>
                                  )}
                                  {log.insights.length > 0 && (
                                    <div className="space-y-1">
                                      {log.insights.map((insight, i) => (
                                        <div
                                          key={i}
                                          className="rounded-lg border bg-blue-50 p-3 text-xs dark:bg-blue-900/20"
                                        >
                                          <p className="font-medium">{insight.category}</p>
                                          <p className="text-muted-foreground">{insight.description}</p>
                                          {insight.url && (
                                            <a
                                              href={insight.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:underline dark:text-blue-400"
                                            >
                                              Learn more
                                            </a>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </section>
  );
}

function renderCallStack(frames: TFCallStackFrame[], depth: number): React.ReactNode {
  return frames.map((frame, i) => (
    <span key={i}>
      <span className={frame.isBlameFrame ? "bg-yellow-100 dark:bg-yellow-900/30" : ""}>
        {"  ".repeat(depth)}
        {frame.sampleCount > 0 && <span className="text-muted-foreground">[{frame.sampleCount}] </span>}
        <span className="text-muted-foreground">{frame.binaryName}</span>
        {" "}
        {frame.symbolName}
        {frame.fileName && <span className="text-muted-foreground"> ({frame.fileName}{frame.lineNumber != null ? `:${frame.lineNumber}` : ""})</span>}
      </span>
      {"\n"}
      {frame.subFrames && renderCallStack(frame.subFrames, depth + 1)}
    </span>
  ));
}

// ── Groups section ────────────────────────────────────────────────

function GroupsSection({
  appId,
  buildId,
  buildGroups,
  availableGroups,
  onGroupAdded,
  onGroupRemoved,
  onGroupsChanged,
  linkSuffix,
}: {
  appId: string;
  buildId: string;
  buildGroups: TFGroup[];
  availableGroups: TFGroup[];
  onGroupAdded: (groupId: string) => void;
  onGroupRemoved: (groupId: string) => void;
  onGroupsChanged: () => void;
  linkSuffix: string;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

  async function addGroup(groupId: string) {
    setAdding(true);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: [groupId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add group");
      }
      toast.success("Build added to group");
      onGroupAdded(groupId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add group");
    } finally {
      setAdding(false);
    }
  }

  async function removeGroup(groupId: string) {
    setRemoving(groupId);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}/groups`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: [groupId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to remove group");
      }
      toast.success("Build removed from group");
      onGroupRemoved(groupId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove group");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="section-title">Groups</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={adding}>
              <Plus size={14} className="mr-1.5" />
              Add to group
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {availableGroups.map((g) => (
              <DropdownMenuItem key={g.id} onClick={() => addGroup(g.id)}>
                <span className={`inline-flex size-4 items-center justify-center rounded text-[10px] font-medium ${g.isInternal ? "bg-muted text-muted-foreground" : "bg-blue-100 text-blue-700"}`}>
                  {g.isInternal ? "I" : "E"}
                </span>
                {g.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setCreateGroupOpen(true)}>
              <Plus size={14} className="text-muted-foreground" />
              {"Add group\u2026"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {buildGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No groups assigned to this build.
        </div>
      ) : (
        <div className="space-y-1">
          {buildGroups.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <Link
                href={`/dashboard/apps/${appId}/testflight/groups/${g.id}${linkSuffix}`}
                className="flex flex-1 items-center gap-3"
              >
                <span className={`inline-flex size-4 items-center justify-center rounded text-[10px] font-medium ${g.isInternal ? "bg-muted text-muted-foreground" : "bg-blue-100 text-blue-700"}`}>
                  {g.isInternal ? "I" : "E"}
                </span>
                <span className="text-sm font-medium">{g.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {g.testerCount} testers
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeGroup(g.id)}
                disabled={removing === g.id}
              >
                {removing === g.id ? (
                  <CircleNotch size={14} className="animate-spin" />
                ) : (
                  <X size={14} />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      <CreateGroupDialog
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        appId={appId}
        onCreated={onGroupsChanged}
      />
    </section>
  );
}

// ── Testers section ───────────────────────────────────────────────

function TestersSection({
  appId,
  buildId,
  testers,
  onRemoved,
  onTesterAdded,
}: {
  appId: string;
  buildId: string;
  testers: TFTester[];
  onRemoved: () => void;
  onTesterAdded: (tester: TFTester) => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function removeTester(testerId: string) {
    setRemoving(testerId);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}/testers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: [testerId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to remove tester");
      }
      toast.success("Tester removed from build");
      onRemoved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove tester");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="section-title">Individual testers</h3>
        <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
          <UserPlus size={14} className="mr-1.5" />
          Add tester
        </Button>
      </div>
      {testers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No individual testers on this build.
        </div>
      ) : (
        <div className="space-y-1">
          {testers.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-lg border px-4 py-3"
            >
              <div className="flex flex-1 items-center gap-3 min-w-0">
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
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  t.state === "INSTALLED"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : t.state === "ACCEPTED"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-muted text-muted-foreground"
                }`}>
                  {t.state === "INSTALLED" ? "Installed" :
                   t.state === "ACCEPTED" ? "Accepted" :
                   t.state === "NOT_INVITED" ? "Not invited" :
                   t.state === "INVITED" ? "Invited" :
                   t.state?.toLowerCase().replace(/_/g, " ") ?? "Unknown"}
                </span>
                <div className="hidden items-center gap-4 text-xs text-muted-foreground tabular-nums sm:flex">
                  <span>{t.sessions} sessions</span>
                  <span>{t.crashes} crashes</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeTester(t.id)}
                disabled={removing === t.id}
              >
                {removing === t.id ? (
                  <CircleNotch size={14} className="animate-spin" />
                ) : (
                  <X size={14} />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      <AddTesterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appId={appId}
        buildId={buildId}
        existingTesterIds={testers.map((t) => t.id)}
        onAdded={onTesterAdded}
      />
    </section>
  );
}

// ── Add tester dialog ─────────────────────────────────────────────

function AddTesterDialog({
  open,
  onOpenChange,
  appId,
  buildId,
  existingTesterIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  buildId: string;
  existingTesterIds: string[];
  onAdded: (tester: TFTester) => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [appTesters, setAppTesters] = useState<TFTester[]>([]);
  const [loadingTesters, setLoadingTesters] = useState(false);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // New tester fields
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const existingSet = useMemo(() => new Set(existingTesterIds), [existingTesterIds]);

  // Fetch app-level testers when dialog opens in "existing" mode
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setEmail("");
    setFirstName("");
    setLastName("");
    setMode("existing");

    setLoadingTesters(true);
    fetch(`/api/apps/${appId}/testflight/builds/${buildId}/testers?scope=app`)
      .then((res) => res.ok ? res.json() : { testers: [] })
      .then((data) => setAppTesters(data.testers ?? []))
      .catch(() => setAppTesters([]))
      .finally(() => setLoadingTesters(false));
  }, [open, appId, buildId]);

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
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}/testers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerIds: [testerId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add tester");
      }
      const tester = appTesters.find((t) => t.id === testerId);
      if (tester) {
        onAdded({ ...tester, state: "INVITED" });
      }
      toast.success("Tester added and invited");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add tester");
    } finally {
      setSubmitting(false);
    }
  }

  async function addNew() {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}/testers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add tester");
      }
      const data = await res.json();
      onAdded({
        id: data.testerId,
        firstName: firstName.trim() || "Anonymous",
        lastName: lastName.trim(),
        email: email.trim(),
        inviteType: "EMAIL",
        state: "INVITED",
        sessions: 0,
        crashes: 0,
        feedbackCount: 0,
      });
      toast.success("Tester invited to build");
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
          <DialogTitle>Add tester</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 border-b pb-3">
          <Button
            variant={mode === "existing" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("existing")}
          >
            Pick existing
          </Button>
          <Button
            variant={mode === "new" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("new")}
          >
            Add new
          </Button>
        </div>

        {mode === "existing" ? (
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
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tester@example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">First name</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Last name</Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={addNew}
                disabled={submitting || !email.trim()}
              >
                {submitting && <CircleNotch size={14} className="mr-1.5 animate-spin" />}
                Add tester
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
