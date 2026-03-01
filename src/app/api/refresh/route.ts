import { NextResponse } from "next/server";
import { z } from "zod";
import { cacheInvalidate, cacheInvalidatePrefix } from "@/lib/cache";

import { listApps } from "@/lib/asc/apps";
import { listVersions } from "@/lib/asc/versions";
import { hasCredentials } from "@/lib/asc/client";
import { errorJson } from "@/lib/api-helpers";

const refreshSchema = z.object({
  appId: z.string().min(1),
});

export async function POST(request: Request) {
  if (!hasCredentials()) {
    return NextResponse.json(
      { error: "No ASC credentials configured" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = refreshSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing appId" }, { status: 400 });
  }

  try {
    // Invalidate apps and versions cache only (not analytics, reviews, etc.)
    cacheInvalidate("apps");
    cacheInvalidatePrefix("versions:");
    await listApps(true);
    await listVersions(parsed.data.appId, true);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
