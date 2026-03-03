import { NextResponse } from "next/server";
import { errorJson } from "@/lib/api-helpers";
import { listPreReleaseVersions } from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (!hasCredentials()) {
    return NextResponse.json({ versions: [], meta: null });
  }

  try {
    const versions = await listPreReleaseVersions(appId, forceRefresh);
    const meta = cacheGetMeta(`tf-pre-release-versions:${appId}`);
    return NextResponse.json({ versions, meta });
  } catch (err) {
    return errorJson(err);
  }
}
