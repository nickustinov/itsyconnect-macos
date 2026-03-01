import { NextResponse } from "next/server";
import { listScreenshotSets } from "@/lib/asc/screenshots";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import {
  uploadScreenshot,
  invalidateScreenshotCache,
} from "@/lib/asc/screenshot-mutations";
import { errorJson } from "@/lib/api-helpers";

type RouteParams = {
  params: Promise<{
    appId: string;
    versionId: string;
    localizationId: string;
  }>;
};

export async function GET(request: Request, { params }: RouteParams) {
  const { localizationId } = await params;
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";

  if (!hasCredentials()) {
    return NextResponse.json({ screenshotSets: [], meta: null });
  }

  try {
    const screenshotSets = await listScreenshotSets(localizationId, forceRefresh);
    const meta = cacheGetMeta(`screenshotSets:${localizationId}`);

    return NextResponse.json({ screenshotSets, meta });
  } catch (err) {
    return errorJson(err);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { localizationId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json(
      { error: "No ASC credentials configured" },
      { status: 400 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const setId = formData.get("setId") as string | null;

    if (!file || !setId) {
      return NextResponse.json(
        { error: "Missing file or setId" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const screenshot = await uploadScreenshot(setId, file.name, buffer);
    invalidateScreenshotCache(localizationId);

    return NextResponse.json({ screenshot });
  } catch (err) {
    return errorJson(err);
  }
}
