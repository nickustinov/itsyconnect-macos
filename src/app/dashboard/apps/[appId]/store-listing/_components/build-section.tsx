import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppIcon } from "@/components/app-icon";
import type { TFBuild } from "@/lib/asc/testflight/types";
import type { AscBuild } from "@/lib/asc/version-types";
import { BUILD_STATUS_DOTS } from "@/lib/asc/display-types";

function formatBuildDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function BuildSection({
  allBuilds,
  selectedBuildId,
  versionBuild,
  versionString,
  onBuildChange,
  readOnly,
}: {
  allBuilds: TFBuild[];
  selectedBuildId: string | null;
  versionBuild: AscBuild | null;
  versionString: string | undefined;
  onBuildChange: (buildId: string) => void;
  readOnly: boolean;
}) {
  const selectedBuild = selectedBuildId
    ? allBuilds.find((b) => b.id === selectedBuildId) ?? null
    : null;

  // Filter to builds matching the current App Store version string (ASC rejects mismatches)
  const eligibleBuilds = useMemo(() => {
    if (!versionString) return allBuilds.filter((b) => !b.expired);
    return allBuilds.filter((b) => !b.expired && b.versionString === versionString);
  }, [allBuilds, versionString]);

  // Read-only: use the version's own build data (may not exist in TF builds list)
  if (readOnly) {
    const build = selectedBuild ?? versionBuild;
    const buildNumber = selectedBuild?.buildNumber ?? versionBuild?.attributes.version;
    const uploadedDate = selectedBuild?.uploadedDate ?? versionBuild?.attributes.uploadedDate;
    const tpl = versionBuild?.attributes.iconAssetToken?.templateUrl;
    const iconUrl = selectedBuild?.iconUrl
      ?? (tpl ? tpl.replace("{w}", "64").replace("{h}", "64").replace("{f}", "png") : null);

    return (
      <section className="space-y-2">
        <h3 className="section-title">Build</h3>
        {build ? (
          <div className="flex items-center gap-4 rounded-lg border p-4">
            <AppIcon iconUrl={iconUrl} name={`Build ${buildNumber}`} className="size-10" iconSize={20} />
            <div>
              <p className="font-semibold">Build {buildNumber}</p>
              {uploadedDate && (
                <p className="text-sm text-muted-foreground">
                  {formatBuildDate(uploadedDate)}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No build attached to this version.
          </div>
        )}
      </section>
    );
  }

  const picker = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {selectedBuild ? "Change" : "Select build"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-80 overflow-y-auto">
        {eligibleBuilds.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            No eligible builds for version {versionString}
          </div>
        ) : (
          eligibleBuilds.map((b) => (
            <DropdownMenuItem key={b.id} onClick={() => onBuildChange(b.id)}>
              <div className="flex w-full items-center gap-3">
                <span className="font-medium tabular-nums">{b.buildNumber}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block size-2 shrink-0 rounded-full ${BUILD_STATUS_DOTS[b.status] ?? "bg-gray-400"}`} />
                  <span className="text-xs text-muted-foreground">{b.status}</span>
                </div>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {formatBuildDate(b.uploadedDate)}
                </span>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!selectedBuild) {
    return (
      <section className="space-y-2">
        <h3 className="section-title">Build</h3>
        <div className="flex items-center justify-center rounded-lg border border-dashed p-6">
          {picker}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="section-title">Build</h3>
      <div className="flex items-center gap-4 rounded-lg border p-4">
        <AppIcon iconUrl={selectedBuild.iconUrl} name={`Build ${selectedBuild.buildNumber}`} className="size-10" iconSize={20} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Build {selectedBuild.buildNumber}</p>
          <p className="text-sm text-muted-foreground">
            {formatBuildDate(selectedBuild.uploadedDate)}
          </p>
        </div>
        {picker}
      </div>
    </section>
  );
}
