import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/asc/client";
import { updateAppInfoCategories } from "@/lib/asc/app-info";
import { errorJson } from "@/lib/api-helpers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ appId: string; appInfoId: string }> },
) {
  const { appId, appInfoId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No credentials" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      primaryCategoryId: string | null;
      secondaryCategoryId: string | null;
    };

    await updateAppInfoCategories(
      appInfoId,
      appId,
      body.primaryCategoryId,
      body.secondaryCategoryId,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
