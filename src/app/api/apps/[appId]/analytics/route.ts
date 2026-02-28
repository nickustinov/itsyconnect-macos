import { NextResponse } from "next/server";
import { buildAnalyticsData } from "@/lib/asc/analytics";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import { getMockAnalyticsData } from "@/lib/mock-analytics";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ data: getMockAnalyticsData(appId), meta: null });
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";

  try {
    const data = await buildAnalyticsData(appId, forceRefresh);
    const meta = cacheGetMeta(`analytics:${appId}`);
    return NextResponse.json({ data, meta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
