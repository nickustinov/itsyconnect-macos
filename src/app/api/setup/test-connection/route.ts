import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ascCredentials } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateAscJwt } from "@/lib/asc/jwt";
import { errorJson } from "@/lib/api-helpers";

const testSchema = z.object({
  issuerId: z.string().min(1, "Issuer ID is required").trim(),
  keyId: z.string().min(1, "Key ID is required").trim(),
  privateKey: z.string().min(1, "Private key is required"),
});

export async function POST(request: Request) {
  // Only available during setup (no active credentials yet)
  const existing = db
    .select({ id: ascCredentials.id })
    .from(ascCredentials)
    .where(eq(ascCredentials.isActive, true))
    .get();

  if (existing) {
    return NextResponse.json(
      { error: "Setup already completed" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const { issuerId, keyId, privateKey } = parsed.data;

  try {
    // Generate JWT
    const token = generateAscJwt(issuerId, keyId, privateKey);

    // Test call – list apps with limit 1
    const response = await fetch(
      "https://api.appstoreconnect.apple.com/v1/apps?limit=1",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return NextResponse.json(
        {
          error: `App Store Connect returned ${response.status}`,
          details: text,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err, 422);
  }
}
