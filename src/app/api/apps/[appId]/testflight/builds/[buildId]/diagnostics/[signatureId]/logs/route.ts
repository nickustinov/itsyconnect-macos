import { NextResponse } from "next/server";
import { errorJson } from "@/lib/api-helpers";
import { getDiagnosticLogs } from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string; buildId: string; signatureId: string }> },
) {
  const { signatureId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ logs: [] });
  }

  try {
    const logs = await getDiagnosticLogs(signatureId);
    return NextResponse.json({ logs });
  } catch (err) {
    return errorJson(err);
  }
}
