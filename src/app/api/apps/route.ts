import { NextResponse } from "next/server";
import { listApps } from "@/lib/asc/apps";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import { errorJson } from "@/lib/api-helpers";

export async function GET() {
  if (!hasCredentials()) {
    return NextResponse.json({ apps: [], meta: null });
  }

  try {
    const apps = await listApps();
    const meta = cacheGetMeta("apps");

    return NextResponse.json({ apps, meta });
  } catch (err) {
    return errorJson(err);
  }
}
