import { NextResponse } from "next/server";
import { z } from "zod";
import { errorJson } from "@/lib/api-helpers";
import { listGroups, createGroup } from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (!hasCredentials()) {
    return NextResponse.json({ groups: [], meta: null });
  }

  try {
    const groups = await listGroups(appId, forceRefresh);
    const meta = cacheGetMeta(`tf-groups:${appId}`);
    return NextResponse.json({ groups, meta });
  } catch (err) {
    return errorJson(err);
  }
}

const createGroupSchema = z.object({
  name: z.string().min(1),
  isInternal: z.boolean(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No ASC credentials" }, { status: 400 });
  }

  try {
    const group = await createGroup(appId, parsed.data.name, parsed.data.isInternal);
    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    return errorJson(err);
  }
}
