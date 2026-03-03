import { NextResponse } from "next/server";
import { errorJson } from "@/lib/api-helpers";
import { listBuilds } from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const platform = url.searchParams.get("platform") ?? undefined;
  const versionString = url.searchParams.get("version") ?? undefined;
  const filters = platform || versionString ? { platform, versionString } : undefined;

  if (!hasCredentials()) {
    return NextResponse.json({ builds: [], meta: null });
  }

  try {
    const builds = await listBuilds(appId, forceRefresh, filters);

    const cacheKey = platform && versionString
      ? `tf-builds:${appId}:${platform}:${versionString}`
      : `tf-builds:${appId}`;
    const meta = cacheGetMeta(cacheKey);
    return NextResponse.json({ builds, meta });
  } catch (err) {
    return errorJson(err);
  }
}
