import { NextResponse } from "next/server";
import { z } from "zod";
import { listCustomerReviews, createReviewResponse, deleteReviewResponse, invalidateReviewsCache } from "@/lib/asc/reviews";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import { errorJson } from "@/lib/api-helpers";

const SORT_MAP: Record<string, "-createdDate" | "createdDate" | "-rating" | "rating"> = {
  newest: "-createdDate",
  oldest: "createdDate",
  highest: "-rating",
  lowest: "rating",
};

const MAX_RESPONSE_LENGTH = 5970;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const url = new URL(request.url);
  const sortParam = url.searchParams.get("sort") ?? "newest";
  const sort = SORT_MAP[sortParam] ?? "-createdDate";

  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (!hasCredentials()) {
    return NextResponse.json({ reviews: [], meta: null });
  }

  try {
    const reviews = await listCustomerReviews(appId, sort, forceRefresh);
    const meta = cacheGetMeta(`reviews:${appId}:${sort}`);
    return NextResponse.json({ reviews, meta });
  } catch (err) {
    return errorJson(err);
  }
}

const replySchema = z.object({
  action: z.literal("reply"),
  reviewId: z.string().min(1),
  responseBody: z.string().min(1).max(MAX_RESPONSE_LENGTH),
});

const updateSchema = z.object({
  action: z.literal("update"),
  reviewId: z.string().min(1),
  responseId: z.string().min(1),
  responseBody: z.string().min(1).max(MAX_RESPONSE_LENGTH),
});

const deleteSchema = z.object({
  action: z.literal("delete"),
  responseId: z.string().min(1),
});

const postSchema = z.discriminatedUnion("action", [replySchema, updateSchema, deleteSchema]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No ASC credentials" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.action === "reply") {
      const result = await createReviewResponse(
        parsed.data.reviewId,
        parsed.data.responseBody,
      );
      invalidateReviewsCache(appId);
      return NextResponse.json({ ok: true, responseId: result.id });
    }

    if (parsed.data.action === "update") {
      // ASC API doesn't support PATCH on customerReviewResponses – delete and re-create
      await deleteReviewResponse(parsed.data.responseId);
      const result = await createReviewResponse(
        parsed.data.reviewId,
        parsed.data.responseBody,
      );
      invalidateReviewsCache(appId);
      return NextResponse.json({ ok: true, responseId: result.id });
    }

    // delete
    await deleteReviewResponse(parsed.data.responseId);
    invalidateReviewsCache(appId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
