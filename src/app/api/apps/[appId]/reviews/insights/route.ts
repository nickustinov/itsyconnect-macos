import { NextResponse } from "next/server";
import { z } from "zod";
import { createLanguageModel, classifyAIError } from "@/lib/ai/provider-factory";
import { getAISettings } from "@/lib/ai/settings";
import { ensureLocalModelLoaded, isLocalOpenAIProvider } from "@/lib/ai/local-provider";
import { buildInsightsPrompt, buildIncrementalInsightsPrompt } from "@/lib/ai/prompts";
import { generateObjectWithRepair } from "@/lib/ai/structured-output";
import { listCustomerReviews } from "@/lib/asc/reviews";
import { hasCredentials } from "@/lib/asc/client";
import { isDemoMode, getDemoReviews } from "@/lib/demo";
import { cacheGet, cacheSet } from "@/lib/cache";
import { errorJson } from "@/lib/api-helpers";

const INSIGHTS_TTL = 24 * 60 * 60 * 1000; // 24 hours

const insightSchema = z.object({
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  potential: z.array(z.string()),
});

export type ReviewInsights = z.infer<typeof insightSchema>;

interface CachedInsights {
  insights: ReviewInsights;
  reviewCount: number;
}

function cacheKey(appId: string): string {
  return `review-insights:${appId}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  const cached = cacheGet<CachedInsights>(cacheKey(appId));
  if (cached) {
    // Get current review count to let client know if update is needed
    let currentCount = cached.reviewCount;
    try {
      if (isDemoMode()) {
        currentCount = getDemoReviews(appId).length;
      } else if (hasCredentials()) {
        const reviews = await listCustomerReviews(appId, "-createdDate");
        currentCount = reviews.length;
      }
    } catch {
      // Fall back to cached count
    }

    return NextResponse.json({
      insights: cached.insights,
      reviewCount: cached.reviewCount,
      currentReviewCount: currentCount,
      cached: true,
    });
  }

  return NextResponse.json({ insights: null, cached: false });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";

  // 1. Get reviews
  let reviews: Array<{ rating: number; title: string; body: string }>;
  try {
    if (isDemoMode()) {
      reviews = getDemoReviews(appId).map((r: { attributes: { rating: number; title: string; body: string } }) => ({
        rating: r.attributes.rating,
        title: r.attributes.title,
        body: r.attributes.body,
      }));
    } else if (hasCredentials()) {
      const raw = await listCustomerReviews(appId, "-createdDate");
      reviews = raw.map((r) => ({
        rating: r.attributes.rating,
        title: r.attributes.title,
        body: r.attributes.body,
      }));
    } else {
      return NextResponse.json({ error: "No ASC credentials" }, { status: 400 });
    }
  } catch (err) {
    return errorJson(err);
  }

  if (reviews.length === 0) {
    return NextResponse.json({ error: "No reviews to analyse" }, { status: 400 });
  }

  // Check cache – if count matches and not forced, return cached
  const cached = cacheGet<CachedInsights>(cacheKey(appId));
  if (!force && cached && cached.reviewCount === reviews.length) {
    return NextResponse.json({
      insights: cached.insights,
      reviewCount: cached.reviewCount,
      currentReviewCount: reviews.length,
      cached: true,
    });
  }

  // 2. Get AI model
  let model;
  let providerId = "";
  let modelId = "";
  try {
    const settings = await getAISettings();
    if (!settings) throw new Error("AI not configured");

    if (isLocalOpenAIProvider(settings.provider)) {
      const loadError = await ensureLocalModelLoaded(
        settings.modelId,
        settings.baseUrl ?? undefined,
        settings.apiKey,
      );
      if (loadError) {
        return NextResponse.json({ error: loadError }, { status: 422 });
      }
    }

    model = createLanguageModel(
      settings.provider,
      settings.modelId,
      settings.apiKey,
      settings.baseUrl ?? undefined,
    );
    providerId = settings.provider;
    modelId = settings.modelId;
  } catch {
    return NextResponse.json({ error: "ai_not_configured" }, { status: 400 });
  }

  // 3. Build prompt – incremental if we have existing insights, full otherwise
  let prompt: string;
  if (!force && cached && cached.reviewCount < reviews.length) {
    // Incremental: only send new reviews (they're sorted newest-first)
    const newReviews = reviews.slice(0, reviews.length - cached.reviewCount);
    prompt = buildIncrementalInsightsPrompt(newReviews, cached.insights, reviews.length);
  } else {
    // Full: cap at 200 reviews
    const capped = reviews.slice(0, 200);
    prompt = buildInsightsPrompt(capped);
  }

  // Provider-specific options to minimise reasoning overhead
  function noThinkingOptions(): Record<string, Record<string, string | number | Record<string, string | number>>> {
    switch (providerId) {
      case "openai":
        return { openai: { reasoningEffort: "low" } };
      case "google":
        if (modelId.startsWith("gemini-3")) {
          return { google: { thinkingConfig: { thinkingLevel: "low" } } };
        }
        return { google: { thinkingConfig: { thinkingBudget: 0 } } };
      default:
        return {};
    }
  }

  try {
    const { object: insights } = await generateObjectWithRepair({
      model,
      schema: insightSchema,
      system: "You are an app review analyst. Be concise and data-driven.",
      prompt,
      temperature: 0,
      providerId,
      providerOptions: noThinkingOptions(),
      maxOutputTokens: isLocalOpenAIProvider(providerId) ? 500 : undefined,
      sectionAliases: {
        strengths: ["strengths"],
        weaknesses: ["weaknesses"],
        potential: ["potential", "opportunities"],
      },
    });

    // Cache the result with review count
    cacheSet(cacheKey(appId), { insights, reviewCount: reviews.length }, INSIGHTS_TTL);

    return NextResponse.json({
      insights,
      reviewCount: reviews.length,
      currentReviewCount: reviews.length,
      cached: false,
    });
  } catch (err) {
    console.warn(`[ai] Review insights generation failed for ${appId}:`, err);
    if (cached?.insights) {
      return NextResponse.json({
        insights: cached.insights,
        reviewCount: cached.reviewCount,
        currentReviewCount: reviews.length,
        cached: true,
        stale: true,
      });
    }
    const category = classifyAIError(err);
    if (category === "auth" || category === "permission") {
      return NextResponse.json({ error: "ai_auth_error" }, { status: 401 });
    }
    return errorJson(err, 500, "AI request failed");
  }
}
