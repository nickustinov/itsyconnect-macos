import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGet, cacheGetMeta } from "@/lib/cache";
import { getMockAnalyticsData } from "@/lib/mock-analytics";
import type { AnalyticsData } from "@/lib/mock-analytics";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ data: getMockAnalyticsData(appId), meta: null });
  }

  const data = cacheGet<AnalyticsData>(`analytics:${appId}`, true);
  if (data) {
    const meta = cacheGetMeta(`analytics:${appId}`);
    return NextResponse.json({ data, meta });
  }

  return NextResponse.json({ data: null, pending: true });
}
