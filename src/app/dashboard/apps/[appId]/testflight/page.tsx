"use client";

import { useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApps } from "@/lib/apps-context";
import {
  getAppTFBuilds,
  MOCK_BETA_GROUPS,
  type MockTFBuild,
} from "@/lib/mock-testflight";
import { PLATFORM_LABELS } from "@/lib/asc/version-types";

const STATUS_DOTS: Record<MockTFBuild["status"], string> = {
  Testing: "bg-green-500",
  "Ready to submit": "bg-yellow-500",
  Processing: "bg-blue-500",
  Expired: "bg-red-500",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function TestFlightBuildsPage() {
  const { appId } = useParams<{ appId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { apps } = useApps();
  const app = apps.find((a) => a.id === appId);
  const allBuilds = useMemo(() => getAppTFBuilds(appId), [appId]);

  const platformFilter = searchParams.get("platform") ?? "all";

  const platformBuilds = useMemo(
    () =>
      platformFilter === "all"
        ? allBuilds
        : allBuilds.filter((b) => b.platform === platformFilter),
    [allBuilds, platformFilter],
  );

  const versions = useMemo(
    () => [...new Set(platformBuilds.map((b) => b.versionString))],
    [platformBuilds],
  );

  const versionParam = searchParams.get("version") ?? "all";
  const effectiveVersion =
    versionParam !== "all" && versions.includes(versionParam)
      ? versionParam
      : "all";

  const builds = useMemo(
    () =>
      effectiveVersion === "all"
        ? platformBuilds
        : platformBuilds.filter((b) => b.versionString === effectiveVersion),
    [platformBuilds, effectiveVersion],
  );

  // Stats
  const stats = useMemo(() => {
    const total = builds.length;
    const dates = builds.map((b) => new Date(b.uploadedDate).getTime());
    const firstDate = dates.length > 0 ? new Date(Math.min(...dates)) : null;
    const latestDate = dates.length > 0 ? new Date(Math.max(...dates)) : null;

    const now = Date.now();
    const activeExpiries = builds
      .filter((b) => b.status === "Testing" || b.status === "Ready to submit")
      .map((b) => new Date(b.expiryDate).getTime())
      .filter((t) => t > now);
    const nearestExpiry =
      activeExpiries.length > 0
        ? Math.ceil((Math.min(...activeExpiries) - now) / (1000 * 60 * 60 * 24))
        : null;

    return { total, firstDate, latestDate, nearestExpiry };
  }, [builds]);

  if (!app) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        App not found
      </div>
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
        <div className="h-8 border-l" />
        <div>
          <p className="text-muted-foreground">Expires in</p>
          <p className="font-medium tabular-nums">
            {stats.nearestExpiry !== null
              ? `${stats.nearestExpiry} days`
              : "–"}
          </p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
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
          {builds.map((build) => {
            const groups = MOCK_BETA_GROUPS.filter((g) =>
              build.groupIds.includes(g.id),
            );

            return (
              <TableRow
                key={build.id}
                className="cursor-pointer"
                onClick={() =>
                  router.push(
                    `/dashboard/apps/${appId}/testflight/${build.id}`,
                  )
                }
              >
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
                      className={`inline-block size-2 shrink-0 rounded-full ${STATUS_DOTS[build.status]}`}
                    />
                    <span className="text-sm">{build.status}</span>
                  </div>
                  {build.status === "Expired" && (
                    <p className="text-xs text-muted-foreground">
                      {formatDate(build.expiryDate)}
                    </p>
                  )}
                  {build.status === "Testing" && (
                    <p className="text-xs text-muted-foreground">
                      Expires {formatDate(build.expiryDate)}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  {groups.length > 0 ? (
                    <div className="space-y-0.5">
                      {groups.map((g) => (
                        <div key={g.id} className="flex items-center gap-1.5 text-sm">
                          <span className={`inline-flex size-4 items-center justify-center rounded text-[10px] font-medium ${g.type === "Internal" ? "bg-muted text-muted-foreground" : "bg-blue-100 text-blue-700"}`}>
                            {g.type === "Internal" ? "I" : "E"}
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
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatDate(build.uploadedDate)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
