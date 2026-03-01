import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/asc/client";
import { updateAppAttributes } from "@/lib/asc/apps";
import { errorJson } from "@/lib/api-helpers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No credentials" }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      contentRightsDeclaration?: string;
      subscriptionStatusUrl?: string | null;
      subscriptionStatusUrlForSandbox?: string | null;
    };

    await updateAppAttributes(appId, {
      contentRightsDeclaration: body.contentRightsDeclaration,
      subscriptionStatusUrl: body.subscriptionStatusUrl,
      subscriptionStatusUrlForSandbox: body.subscriptionStatusUrlForSandbox,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err, 500);
  }
}
