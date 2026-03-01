import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ascCredentials } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { generateAscJwt } from "@/lib/asc/jwt";
import { errorJson } from "@/lib/api-helpers";

const testSchema = z.object({
  id: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing credential ID" }, { status: 400 });
  }

  const cred = db
    .select()
    .from(ascCredentials)
    .where(eq(ascCredentials.id, parsed.data.id))
    .get();

  if (!cred) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }

  try {
    const privateKey = decrypt({
      ciphertext: cred.encryptedPrivateKey,
      iv: cred.iv,
      authTag: cred.authTag,
      encryptedDek: cred.encryptedDek,
    });

    const token = generateAscJwt(cred.issuerId, cred.keyId, privateKey);

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
      return NextResponse.json(
        { error: `App Store Connect returned ${response.status}` },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err, 422);
  }
}
