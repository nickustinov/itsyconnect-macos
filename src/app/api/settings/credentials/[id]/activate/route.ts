import { NextResponse } from "next/server";
import { db } from "@/db";
import { ascCredentials } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cacheInvalidateAll } from "@/lib/cache";
import { resetToken } from "@/lib/asc/client";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Verify the target credential exists
  const target = db
    .select({ id: ascCredentials.id })
    .from(ascCredentials)
    .where(eq(ascCredentials.id, id))
    .get();

  if (!target) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }

  // Deactivate all credentials
  db.update(ascCredentials).set({ isActive: false }).run();

  // Activate the target
  db.update(ascCredentials)
    .set({ isActive: true })
    .where(eq(ascCredentials.id, id))
    .run();

  // Clear cache and token – UI will fetch fresh data from ASC on next load
  cacheInvalidateAll();
  resetToken();

  return NextResponse.json({ ok: true });
}
