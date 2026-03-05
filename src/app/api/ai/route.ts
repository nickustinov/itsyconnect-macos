import { NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { createLanguageModel, classifyAIError } from "@/lib/ai/provider-factory";
import { getAISettings } from "@/lib/ai/settings";
import { ensureLocalModelLoaded, isLocalOpenAIProvider } from "@/lib/ai/local-provider";
import {
  buildTranslatePrompt,
  buildImprovePrompt,
  buildReplyPrompt,
  buildAppealPrompt,
  buildGenerateKeywordsPrompt,
  buildOptimizeKeywordsPrompt,
  buildFillKeywordGapsPrompt,
} from "@/lib/ai/prompts";
import { errorJson, parseBody } from "@/lib/api-helpers";

/**
 * Provider-specific options to minimise reasoning/thinking overhead.
 * Our use cases (translation, copywriting, keywords) don't benefit from
 * chain-of-thought, so we disable or minimise it for every provider.
 */
function noThinkingOptions(
  providerId: string,
  modelId: string,
): Record<string, Record<string, string | number | Record<string, string | number>>> {
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

/** Truncate text to a character limit without breaking mid-word or mid-keyword. */
function truncateToLimit(text: string, limit: number, field: string): string {
  if (text.length <= limit) return text;

  // Keywords: drop trailing keywords at comma boundaries
  if (field === "keywords") {
    let truncated = text.slice(0, limit);
    const lastComma = truncated.lastIndexOf(",");
    if (lastComma > 0) {
      truncated = truncated.slice(0, lastComma);
    }
    return truncated;
  }

  // Text fields: break at last whitespace
  let truncated = text.slice(0, limit);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > limit * 0.8) {
    truncated = truncated.slice(0, lastSpace);
  }
  return truncated;
}

/** Heuristic check for conversational AI responses that aren't usable as App Store text. */
function looksConversational(text: string): boolean {
  const lower = text.trimStart().toLowerCase();
  const conversationalPrefixes = [
    "i ", "i'", "sure", "certainly", "of course", "here's", "here is",
    "let me", "i notice", "i can", "i'll", "i would", "unfortunately",
    "i apologize", "i'm sorry", "could you", "would you", "please provide",
    "it seems", "it appears", "it looks like", "note:", "note that",
  ];
  return conversationalPrefixes.some((p) => lower.startsWith(p));
}

const requestSchema = z.object({
  action: z.enum([
    "translate",
    "improve",
    "copy",
    "generate-keywords",
    "optimize-keywords",
    "fill-keyword-gaps",
    "draft-reply",
    "draft-appeal",
  ]),
  text: z.string(),
  field: z.string().optional(),
  reviewTitle: z.string().optional(),
  rating: z.number().optional(),
  fromLocale: z.string().optional(),
  toLocale: z.string().optional(),
  locale: z.string().optional(),
  appName: z.string().optional(),
  charLimit: z.number().optional(),
  description: z.string().optional(),
  otherLocaleKeywords: z.record(z.string(), z.string()).optional(),
});

export async function POST(request: Request) {
  const parsed = await parseBody(request, requestSchema);
  if (parsed instanceof Response) return parsed;

  const {
    action, text, field, reviewTitle, rating, fromLocale, toLocale, locale,
    appName, charLimit, description, otherLocaleKeywords,
  } = parsed;

  // Copy needs no AI – echo the text back
  if (action === "copy") {
    return NextResponse.json({ result: text });
  }

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
    return NextResponse.json(
      { error: "ai_not_configured" },
      { status: 400 },
    );
  }

  const context = { field: field ?? "", appName, charLimit };

  let prompt: string;
  switch (action) {
    case "translate": {
      if (!fromLocale || !toLocale) {
        return NextResponse.json(
          { error: "fromLocale and toLocale are required for translate" },
          { status: 400 },
        );
      }
      prompt = buildTranslatePrompt(text, fromLocale, toLocale, context);
      break;
    }
    case "improve": {
      if (!locale) {
        return NextResponse.json(
          { error: "locale is required for improve" },
          { status: 400 },
        );
      }
      prompt = buildImprovePrompt(text, locale, context);
      break;
    }
    case "generate-keywords": {
      if (!locale) {
        return NextResponse.json(
          { error: "locale is required for generate-keywords" },
          { status: 400 },
        );
      }
      prompt = buildGenerateKeywordsPrompt(locale, { ...context, description });
      break;
    }
    case "optimize-keywords": {
      if (!locale) {
        return NextResponse.json(
          { error: "locale is required for optimize-keywords" },
          { status: 400 },
        );
      }
      prompt = buildOptimizeKeywordsPrompt(text, locale, { ...context, description });
      break;
    }
    case "fill-keyword-gaps": {
      if (!locale) {
        return NextResponse.json(
          { error: "locale is required for fill-keyword-gaps" },
          { status: 400 },
        );
      }
      prompt = buildFillKeywordGapsPrompt(text, locale, otherLocaleKeywords ?? {}, context);
      break;
    }
    case "draft-reply": {
      prompt = buildReplyPrompt(reviewTitle ?? "", text, rating ?? 3, appName);
      break;
    }
    case "draft-appeal": {
      prompt = buildAppealPrompt(reviewTitle ?? "", text, rating ?? 1, appName);
      break;
    }
  }

  try {
    const needsVariety = action === "draft-reply" || action === "draft-appeal";

    const { text: result } = await generateText({
      model,
      system: "You are a text-processing tool. Output ONLY the final result as plain text with no preamble, explanation, or commentary. Never use markdown, HTML, or any formatting syntax. Never refuse or ask questions.",
      prompt,
      temperature: needsVariety ? 0.9 : 0,
      providerOptions: noThinkingOptions(providerId, modelId),
    });

    // Detect conversational responses that slipped through the prompt constraints
    if (looksConversational(result)) {
      return NextResponse.json(
        { error: "The AI returned a conversational response instead of usable text. Please try again." },
        { status: 422 },
      );
    }

    // Enforce character limit as a safety net – LLMs don't always respect prompt constraints
    const finalResult = charLimit ? truncateToLimit(result, charLimit, field ?? "") : result;

    return NextResponse.json({ result: finalResult });
  } catch (err) {
    const category = classifyAIError(err);
    if (category === "auth" || category === "permission") {
      return NextResponse.json({ error: "ai_auth_error" }, { status: 401 });
    }
    return errorJson(err, 500, "AI request failed");
  }
}
