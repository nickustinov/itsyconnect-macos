import { NextResponse } from "next/server";
import { z } from "zod";
import { errorJson } from "@/lib/api-helpers";
import { listBuilds, updateBetaBuildLocalization } from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string; buildId: string }> },
) {
  const { appId, buildId } = await params;
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No ASC credentials" }, { status: 400 });
  }

  try {
    const builds = await listBuilds(appId, forceRefresh);
    const build = builds.find((b) => b.id === buildId);
    if (!build) {
      return NextResponse.json({ error: "Build not found" }, { status: 404 });
    }
    return NextResponse.json({ build, meta: null });
  } catch (err) {
    return errorJson(err);
  }
}

const patchSchema = z.object({
  whatsNew: z.string().max(4000),
  localizationId: z.string().min(1),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ appId: string; buildId: string }> },
) {
  await params;

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No ASC credentials" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await updateBetaBuildLocalization(parsed.data.localizationId, parsed.data.whatsNew);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
