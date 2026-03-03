import { NextResponse } from "next/server";
import { errorJson } from "@/lib/api-helpers";
import { listDiagnosticSignatures } from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";
import type { TFDiagnosticType } from "@/lib/asc/testflight";

const VALID_TYPES = new Set(["DISK_WRITES", "HANGS", "LAUNCHES"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string; buildId: string }> },
) {
  const { buildId } = await params;
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const typeParam = url.searchParams.get("type") ?? undefined;
  const type = typeParam && VALID_TYPES.has(typeParam)
    ? (typeParam as TFDiagnosticType)
    : undefined;

  if (!hasCredentials()) {
    return NextResponse.json({ signatures: [] });
  }

  try {
    const signatures = await listDiagnosticSignatures(buildId, type, forceRefresh);
    return NextResponse.json({ signatures });
  } catch (err) {
    return errorJson(err);
  }
}
