"use client";

import { useState } from "react";
import {
  useParams,
  usePathname,
  useSearchParams,
  useRouter,
} from "next/navigation";
import { ArrowsClockwise, FloppyDisk, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useApps } from "@/lib/apps-context";
import { useVersions } from "@/lib/versions-context";
import { useFormDirty } from "@/lib/form-dirty-context";
import {
  getVersionPlatforms,
  getVersionsByPlatform,
  resolveVersion,
  EDITABLE_STATES,
  PLATFORM_LABELS,
  STATE_DOT_COLORS,
  type AscVersion,
} from "@/lib/asc/version-types";

const VERSION_PAGES = new Set(["store-listing", "screenshots", "review"]);
const NEW_VERSION_PAGES = new Set(["", "store-listing", "screenshots", "review"]);
const SAVE_ONLY_PAGES = new Set(["details"]);

const LIVE_STATES = new Set([
  "READY_FOR_SALE",
  "READY_FOR_DISTRIBUTION",
  "ACCEPTED",
]);

/** All non-live versions + only the most recent live version. */
function filterPickerVersions(versions: AscVersion[]): AscVersion[] {
  let foundLive = false;
  return versions.filter((v) => {
    if (!LIVE_STATES.has(v.attributes.appVersionState)) return true;
    if (!foundLive) { foundLive = true; return true; }
    return false;
  });
}

export function HeaderVersionPicker() {
  const { appId } = useParams<{ appId?: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { versions } = useVersions();

  if (!appId) return null;

  const pageSegment = pathname
    .replace(`/dashboard/apps/${appId}`, "")
    .replace(/^\//, "")
    .split("/")[0];

  if (!NEW_VERSION_PAGES.has(pageSegment) && !SAVE_ONLY_PAGES.has(pageSegment)) return null;

  if (SAVE_ONLY_PAGES.has(pageSegment)) return null;

  const showVersionPicker = VERSION_PAGES.has(pageSegment);
  const platforms = getVersionPlatforms(versions);
  const versionParam = searchParams.get("version");
  const selectedVersion = resolveVersion(versions, versionParam);
  const currentPlatform = selectedVersion?.attributes.platform ?? platforms[0] ?? "IOS";
  const platformVersions = filterPickerVersions(getVersionsByPlatform(versions, currentPlatform));

  function navigate(versionId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("version", versionId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function handlePlatformChange(platform: string) {
    const pvs = getVersionsByPlatform(versions, platform);
    if (pvs.length > 0) {
      navigate(pvs[0].id);
    }
  }

  return (
    <>
      {showVersionPicker && (
        <>
          <Separator orientation="vertical" className="mx-2 !h-4" />
          <Select value={currentPlatform} onValueChange={handlePlatformChange}>
            <SelectTrigger className="!h-7 gap-1 bg-background px-2 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {platforms.map((p) => (
                <SelectItem key={p} value={p}>
                  {PLATFORM_LABELS[p] ?? p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedVersion?.id ?? ""}
            onValueChange={navigate}
          >
            <SelectTrigger className="!h-7 gap-1 bg-background px-2 font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {platformVersions.map((v) => (
                <SelectItem key={v.id} value={v.id} className="font-mono">
                  <span className="flex items-center gap-1.5">
                    {v.attributes.versionString}
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${STATE_DOT_COLORS[v.attributes.appVersionState] ?? "bg-muted-foreground"}`}
                    />
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

        </>
      )}
    </>
  );
}

export function HeaderVersionActions() {
  const { appId } = useParams<{ appId?: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { versions } = useVersions();
  const { isDirty, onSave } = useFormDirty();

  if (!appId) return null;

  const pageSegment = pathname
    .replace(`/dashboard/apps/${appId}`, "")
    .replace(/^\//, "")
    .split("/")[0];

  const showSave = SAVE_ONLY_PAGES.has(pageSegment);
  const showVersionActions = VERSION_PAGES.has(pageSegment);
  const showNewVersion = NEW_VERSION_PAGES.has(pageSegment);

  if (!showSave && !showVersionActions && !showNewVersion) return null;

  const selectedVersion = resolveVersion(versions, searchParams.get("version"));
  const readOnly = selectedVersion
    ? !EDITABLE_STATES.has(selectedVersion.attributes.appVersionState)
    : true;

  return (
    <>
      {showNewVersion && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() =>
            toast.info("New version creation not available in prototype")
          }
        >
          <Plus size={12} />
          New version
        </Button>
      )}
      {(showSave || (showVersionActions && !readOnly)) && (
        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={!isDirty}
          onClick={onSave}
        >
          <FloppyDisk size={12} />
          Save
        </Button>
      )}
    </>
  );
}

export function HeaderRefreshButton() {
  const { appId } = useParams<{ appId?: string }>();
  const { refresh: refreshApps } = useApps();
  const { loading, refresh: refreshVersions } = useVersions();
  const [refreshing, setRefreshing] = useState(false);

  if (!appId) return null;

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId }),
      });
      await Promise.all([refreshApps(), refreshVersions()]);
    } finally {
      setRefreshing(false);
    }
  }

  const busy = loading || refreshing;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="ml-2 size-7"
      onClick={handleRefresh}
      disabled={busy}
    >
      <ArrowsClockwise size={14} className={busy ? "animate-spin" : ""} />
    </Button>
  );
}
