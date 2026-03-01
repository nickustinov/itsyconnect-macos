import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/asc/client";
import {
  updateReviewDetail,
  createReviewDetail,
  invalidateVersionsCache,
} from "@/lib/asc/review-mutations";
import { errorJson } from "@/lib/api-helpers";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ appId: string; versionId: string }> },
) {
  const { appId, versionId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No credentials" }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      reviewDetailId: string | null;
      attributes: Record<string, unknown>;
    };

    const { reviewDetailId, attributes } = body;

    if (reviewDetailId) {
      await updateReviewDetail(reviewDetailId, attributes);
    } else {
      await createReviewDetail(versionId, attributes);
    }

    invalidateVersionsCache(appId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
