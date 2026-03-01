import { NextResponse } from "next/server";
import { z } from "zod";
import { errorJson } from "@/lib/api-helpers";
import { addBuildToGroups, removeBuildFromGroups } from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";

const schema = z.object({
  buildIds: z.array(z.string().min(1)).min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string; groupId: string }> },
) {
  const { groupId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ ok: true });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await Promise.all(
      parsed.data.buildIds.map((buildId) => addBuildToGroups(buildId, [groupId])),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ appId: string; groupId: string }> },
) {
  const { groupId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ ok: true });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await Promise.all(
      parsed.data.buildIds.map((buildId) => removeBuildFromGroups(buildId, [groupId])),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
