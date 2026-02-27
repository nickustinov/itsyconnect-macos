import { NextResponse } from "next/server";
import { listVersions } from "@/lib/asc/versions";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";


export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ versions: [], meta: null });
  }

  try {
    const versions = await listVersions(appId);
    const meta = cacheGetMeta(`versions:${appId}`);

    return NextResponse.json({ versions, meta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
