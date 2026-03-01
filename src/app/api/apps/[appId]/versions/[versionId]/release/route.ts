import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/asc/client";
import {
  updateVersionAttributes,
  enablePhasedRelease,
  disablePhasedRelease,
  invalidateVersionsCache,
} from "@/lib/asc/version-mutations";
import { errorJson } from "@/lib/api-helpers";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ appId: string; versionId: string }> },
) {
  const { appId, versionId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No credentials" }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      releaseType: string;
      earliestReleaseDate: string | null;
      phasedRelease: boolean;
      phasedReleaseId: string | null;
    };

    const errors: string[] = [];

    // Update version release type
    try {
      await updateVersionAttributes(versionId, {
        releaseType: body.releaseType,
        earliestReleaseDate: body.earliestReleaseDate,
      });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Failed to update release type");
    }

    // Handle phased release toggle
    try {
      if (body.phasedRelease && !body.phasedReleaseId) {
        await enablePhasedRelease(versionId);
      } else if (!body.phasedRelease && body.phasedReleaseId) {
        await disablePhasedRelease(body.phasedReleaseId);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Failed to update phased release");
    }

    invalidateVersionsCache(appId);

    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors }, { status: 207 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err, 500);
  }
}
