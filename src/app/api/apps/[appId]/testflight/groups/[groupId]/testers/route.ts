import { NextResponse } from "next/server";
import { z } from "zod";
import { errorJson } from "@/lib/api-helpers";
import { listAppBetaTesters, addTestersToGroup, removeTestersFromGroup } from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string; groupId: string }> },
) {
  const { appId } = await params;
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");

  if (!hasCredentials()) {
    return NextResponse.json({ testers: [] });
  }

  if (scope !== "app") {
    return NextResponse.json({ error: "Only scope=app is supported" }, { status: 400 });
  }

  try {
    const testers = await listAppBetaTesters(appId);
    return NextResponse.json({ testers });
  } catch (err) {
    return errorJson(err);
  }
}

const testerIdsSchema = z.object({
  testerIds: z.array(z.string().min(1)).min(1),
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

  const parsed = testerIdsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await addTestersToGroup(groupId, parsed.data.testerIds);
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

  const parsed = testerIdsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await removeTestersFromGroup(groupId, parsed.data.testerIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
