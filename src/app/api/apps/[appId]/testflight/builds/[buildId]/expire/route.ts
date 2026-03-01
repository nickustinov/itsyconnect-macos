import { NextResponse } from "next/server";
import { errorJson } from "@/lib/api-helpers";
import { expireBuild } from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ appId: string; buildId: string }> },
) {
  const { buildId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ ok: true });
  }

  try {
    await expireBuild(buildId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
