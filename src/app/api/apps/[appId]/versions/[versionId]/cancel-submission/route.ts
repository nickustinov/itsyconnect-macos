import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/asc/client";
import {
  cancelSubmission,
  invalidateVersionsCache,
} from "@/lib/asc/version-mutations";
import { errorJson } from "@/lib/api-helpers";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ appId: string; versionId: string }> },
) {
  const { appId, versionId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No credentials" }, { status: 401 });
  }

  try {
    await cancelSubmission(versionId);
    invalidateVersionsCache(appId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err, 500);
  }
}
