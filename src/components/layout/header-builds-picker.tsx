"use client";

import {
  useParams,
  usePathname,
  useSearchParams,
  useRouter,
} from "next/navigation";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAppTFBuilds } from "@/lib/mock-testflight";
import { PLATFORM_LABELS } from "@/lib/asc/version-types";

export function HeaderBuildsPicker() {
  const { appId } = useParams<{ appId?: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  if (!appId) return null;

  // Only show on the testflight builds list page
  const afterApp = pathname.replace(`/dashboard/apps/${appId}`, "").replace(/^\//, "");
  if (afterApp !== "testflight") return null;

  const builds = getAppTFBuilds(appId);
  const platforms = [...new Set(builds.map((b) => b.platform))];
  const currentPlatform = searchParams.get("platform") ?? "all";

  const platformBuilds =
    currentPlatform === "all"
      ? builds
      : builds.filter((b) => b.platform === currentPlatform);
  const versions = [...new Set(platformBuilds.map((b) => b.versionString))];
  const currentVersion = searchParams.get("version") ?? "all";
  const effectiveVersion =
    currentVersion !== "all" && versions.includes(currentVersion)
      ? currentVersion
      : "all";

  function navigate(params: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === "all") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  if (platforms.length <= 1 && versions.length <= 1) return null;

  return (
    <>
      <Separator orientation="vertical" className="mx-2 !h-4" />
      {platforms.length > 1 && (
        <Select
          value={currentPlatform}
          onValueChange={(v) => navigate({ platform: v, version: "all" })}
        >
          <SelectTrigger className="h-7 w-36 gap-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {platforms.map((p) => (
              <SelectItem key={p} value={p}>
                {PLATFORM_LABELS[p] ?? p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {versions.length > 1 && (
        <Select value={effectiveVersion} onValueChange={(v) => navigate({ version: v })}>
          <SelectTrigger className="h-7 w-32 gap-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All versions</SelectItem>
            {versions.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </>
  );
}
