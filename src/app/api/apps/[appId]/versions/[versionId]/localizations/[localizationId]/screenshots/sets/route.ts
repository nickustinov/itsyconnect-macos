import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/asc/client";
import {
  createScreenshotSet,
  deleteScreenshotSet,
  invalidateScreenshotCache,
} from "@/lib/asc/screenshot-mutations";

type RouteParams = {
  params: Promise<{
    appId: string;
    versionId: string;
    localizationId: string;
  }>;
};

export async function POST(request: Request, { params }: RouteParams) {
  const { localizationId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No credentials" }, { status: 401 });
  }

  try {
    const { displayType } = (await request.json()) as { displayType: string };
    if (!displayType) {
      return NextResponse.json(
        { error: "Missing displayType" },
        { status: 400 },
      );
    }

    const setId = await createScreenshotSet(localizationId, displayType);
    invalidateScreenshotCache(localizationId);

    return NextResponse.json({ setId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { localizationId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No credentials" }, { status: 401 });
  }

  try {
    const { setId } = (await request.json()) as { setId: string };
    if (!setId) {
      return NextResponse.json({ error: "Missing setId" }, { status: 400 });
    }

    await deleteScreenshotSet(setId);
    invalidateScreenshotCache(localizationId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
