import { NextResponse } from "next/server";
import { listVersions } from "@/lib/asc/versions";
import { createVersion, updateVersionAttributes, invalidateVersionsCache } from "@/lib/asc/version-mutations";
import { hasCredentials } from "@/lib/asc/client";
import { EDITABLE_STATES } from "@/lib/asc/version-types";
import { cacheGetMeta } from "@/lib/cache";
import { errorJson } from "@/lib/api-helpers";


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
    return errorJson(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No ASC credentials" }, { status: 400 });
  }

  const body = await request.json();
  const { versionString, platform } = body as {
    versionString: string;
    platform: string;
  };

  if (!versionString || !platform) {
    return NextResponse.json(
      { error: "versionString and platform are required" },
      { status: 400 },
    );
  }

  try {
    // Check if there's already an editable version for this platform
    const versions = await listVersions(appId);
    const existing = versions.find(
      (v) =>
        v.attributes.platform === platform &&
        EDITABLE_STATES.has(v.attributes.appVersionState),
    );

    if (existing) {
      // Update the existing version's versionString instead of creating new
      await updateVersionAttributes(existing.id, { versionString });
      invalidateVersionsCache(appId);
      return NextResponse.json({ ok: true, versionId: existing.id }, { status: 200 });
    }

    const versionId = await createVersion(appId, versionString, platform);
    return NextResponse.json({ ok: true, versionId }, { status: 201 });
  } catch (err) {
    return errorJson(err);
  }
}
