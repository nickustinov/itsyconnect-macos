import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import { buildAnalyticsData, getCachedAnalytics, getReportInitiatedAt } from "@/lib/asc/analytics";
import { isDemoMode, getDemoAnalytics } from "@/lib/demo";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ data: getDemoAnalytics(appId), meta: null });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ data: null, meta: null });
  }

  const data = getCachedAnalytics(appId);
  if (data) {
    const meta = cacheGetMeta(`analytics:${appId}`);
    return NextResponse.json({ data, meta });
  }

  // No cached data – trigger background build (deduplicated in buildAnalyticsData)
  buildAnalyticsData(appId).catch((err) => {
    console.error(`[analytics] Background build failed for ${appId}:`, err);
  });

  // Check if we recently created the report requests for this app.
  // Apple needs 24–48h to generate data after the first request.
  const initiatedAt = getReportInitiatedAt(appId);
  return NextResponse.json({
    data: null,
    pending: true,
    ...(initiatedAt ? { reportInitiated: true, initiatedAt } : {}),
  });
}
