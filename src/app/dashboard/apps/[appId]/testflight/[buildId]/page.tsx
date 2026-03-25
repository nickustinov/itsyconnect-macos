"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CircleNotch, MagicWand } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useRegisterRefresh } from "@/lib/refresh-context";
import { useSetBreadcrumbTitle } from "@/lib/breadcrumb-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import { AppIcon } from "@/components/app-icon";
import { CharCount } from "@/components/char-count";
import { useBuildAction } from "@/lib/build-action-context";
import type { TFBuild, TFGroup, TFTester } from "@/lib/asc/testflight";
import { BUILD_STATUS_DOTS } from "@/lib/asc/display-types";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { formatDateTime } from "@/lib/format";
import { DiagnosticsSection } from "./_components/diagnostics-section";
import { GroupsSection } from "./_components/groups-section";
import { TestersSection } from "./_components/testers-section";

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

  const [siblingBuilds, setSiblingBuilds] = useState<TFBuild[]>([]);

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

  // Fetch sibling builds (same version) for "copy from build" feature
  useEffect(() => {
    if (!build) return;
    fetch(`/api/apps/${appId}/testflight/builds?version=${encodeURIComponent(build.versionString)}&platform=${encodeURIComponent(build.platform)}&lite=1`)
      .then((res) => res.ok ? res.json() : { builds: [] })
      .then((data) => {
        const siblings = (data.builds ?? []).filter(
          (b: TFBuild) => b.id !== buildId && b.whatsNew,
        );
        setSiblingBuilds(siblings);
      })
      .catch(() => setSiblingBuilds([]));
  }, [appId, buildId, build?.versionString, build?.platform]);

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
      if (!build) return;
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsNew,
          localizationId: build.whatsNewLocalizationId,
          locale: "en-US",
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
      if (!build) return;
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsNew,
          localizationId: build.whatsNewLocalizationId,
          locale: "en-US",
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
    return <ErrorState message={error} onRetry={() => fetchData()} />;
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
        <div className="flex items-center gap-2">
          <h3 className="section-title">What&apos;s new</h3>
          {!isExpired && siblingBuilds.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-6 text-muted-foreground">
                  <MagicWand size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Copy from build</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {siblingBuilds.map((sb) => (
                      <DropdownMenuItem
                        key={sb.id}
                        onClick={() => {
                          setWhatsNew(sb.whatsNew!);
                          setDirty(sb.whatsNew !== (build.whatsNew ?? ""));
                        }}
                      >
                        Build {sb.buildNumber}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
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
