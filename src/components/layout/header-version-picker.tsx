"use client";

import {
  useParams,
  usePathname,
  useSearchParams,
  useRouter,
} from "next/navigation";
import { FloppyDisk, Plus } from "@phosphor-icons/react";
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
import {
  getAppPlatforms,
  getVersionsByPlatform,
  resolveVersion,
} from "@/lib/mock-data";

const VERSION_PAGES = new Set(["store-listing", "screenshots", "review"]);
const NEW_VERSION_PAGES = new Set(["", "store-listing", "screenshots", "review"]);

const EDITABLE_STATES = new Set([
  "PREPARE_FOR_SUBMISSION",
  "REJECTED",
  "METADATA_REJECTED",
  "DEVELOPER_REJECTED",
]);

const PLATFORM_LABELS: Record<string, string> = {
  IOS: "iOS",
  MAC_OS: "macOS",
  TV_OS: "tvOS",
  VISION_OS: "visionOS",
};

const STATE_DOT_COLORS: Record<string, string> = {
  READY_FOR_SALE: "bg-green-500",
  READY_FOR_DISTRIBUTION: "bg-green-500",
  ACCEPTED: "bg-green-500",
  IN_REVIEW: "bg-blue-500",
  WAITING_FOR_REVIEW: "bg-amber-500",
  PREPARE_FOR_SUBMISSION: "bg-yellow-500",
  REJECTED: "bg-red-500",
  METADATA_REJECTED: "bg-red-500",
  DEVELOPER_REJECTED: "bg-red-500",
};

function stateLabel(state: string): string {
  return state
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function HeaderVersionPicker() {
  const { appId } = useParams<{ appId?: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  if (!appId) return null;

  const pageSegment = pathname
    .replace(`/dashboard/apps/${appId}`, "")
    .replace(/^\//, "")
    .split("/")[0];

  if (!NEW_VERSION_PAGES.has(pageSegment)) return null;

  const showVersionPicker = VERSION_PAGES.has(pageSegment);
  const platforms = getAppPlatforms(appId);
  const versionParam = searchParams.get("version");
  const selectedVersion = resolveVersion(appId, versionParam);
  const currentPlatform = selectedVersion?.platform ?? platforms[0] ?? "IOS";
  const platformVersions = getVersionsByPlatform(appId, currentPlatform);
  const readOnly = selectedVersion
    ? !EDITABLE_STATES.has(selectedVersion.appVersionState)
    : true;

  function navigate(versionId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("version", versionId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function handlePlatformChange(platform: string) {
    const versions = getVersionsByPlatform(appId!, platform);
    if (versions.length > 0) {
      navigate(versions[0].id);
    }
  }

  return (
    <>
      {showVersionPicker && (
        <>
          <Separator orientation="vertical" className="mx-2 !h-4" />
          <Select value={currentPlatform} onValueChange={handlePlatformChange}>
            <SelectTrigger className="h-7 w-24 gap-1 text-xs">
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
            <SelectTrigger className="h-7 w-28 gap-1 font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {platformVersions.map((v) => (
                <SelectItem key={v.id} value={v.id} className="font-mono">
                  {v.versionString}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedVersion && (
            <span className="ml-1 hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
              <span
                className={`size-1.5 shrink-0 rounded-full ${STATE_DOT_COLORS[selectedVersion.appVersionState] ?? "bg-muted-foreground"}`}
              />
              {stateLabel(selectedVersion.appVersionState)}
            </span>
          )}
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
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
        {showVersionPicker && !readOnly && (
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => toast.success("Changes saved (prototype)")}
          >
            <FloppyDisk size={12} />
            Save
          </Button>
        )}
      </div>
    </>
  );
}
