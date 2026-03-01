import { NextResponse } from "next/server";
import { listAppInfos } from "@/lib/asc/app-info";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import { errorJson } from "@/lib/api-helpers";


export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ appInfos: [], meta: null });
  }

  try {
    const appInfos = await listAppInfos(appId);
    const meta = cacheGetMeta(`appInfos:${appId}`);

    return NextResponse.json({ appInfos, meta });
  } catch (err) {
    return errorJson(err);
  }
}
