import { NextResponse } from "next/server";
import { errorJson } from "@/lib/api-helpers";
import { declareExportCompliance } from "@/lib/asc/testflight";
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
    await declareExportCompliance(buildId, false);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
