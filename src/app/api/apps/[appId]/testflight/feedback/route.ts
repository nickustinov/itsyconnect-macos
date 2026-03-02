import { NextResponse } from "next/server";
import { errorJson } from "@/lib/api-helpers";
import { listFeedback, deleteFeedbackItem } from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import { getCompletedFeedbackIds } from "@/lib/feedback-completed";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  const completedIds = getCompletedFeedbackIds(appId);

  if (!hasCredentials()) {
    return NextResponse.json({ feedback: [], completedIds, meta: null });
  }

  try {
    const feedback = await listFeedback(appId, forceRefresh);
    const meta = cacheGetMeta(`tf-feedback:${appId}`);
    return NextResponse.json({ feedback, completedIds, meta });
  } catch (err) {
    return errorJson(err);
  }
}

export async function DELETE(
  request: Request,
) {
  const body = await request.json() as { id: string; type: "screenshot" | "crash" };

  try {
    await deleteFeedbackItem(body.id, body.type);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
