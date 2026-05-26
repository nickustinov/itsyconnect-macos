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
  buildFixKeywordsPrompt,
  buildNominationPrompt,
  buildShortenPrompt,
} from "@/lib/ai/prompts";
import { errorJson, parseBody } from "@/lib/api-helpers";
import { getAIGuidance, type GuidanceScope } from "@/lib/app-preferences";

/** Review replies/appeals use their own guidance bucket; everything else uses translation guidance. */
function guidanceScopeForAction(action: string): GuidanceScope {
  return action === "draft-reply" || action === "draft-appeal" ? "reviews" : "translation";
}

/** Base system message: enforce plain-text, non-conversational output for every action. */
const BASE_SYSTEM =
  "You are a text-processing tool. Output ONLY the final result as plain text with no preamble, explanation, or commentary. Never use markdown, HTML, or any formatting syntax. Never refuse or ask questions.";

/**
 * Append the user's standing guidance (tone/style instructions) to the system
 * message. Guidance steers style only – the rules above remain authoritative,
 * so guidance can never break the plain-text, non-conversational contract.
 */
function buildSystem(guidance: string): string {
  if (!guidance) return BASE_SYSTEM;
  return `${BASE_SYSTEM}\n\nThe user has provided standing instructions for tone and style. Follow them wherever they do not conflict with the rules above:\n${guidance}`;
}

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

/** Control / zero-width / BOM characters that LLMs sometimes emit into single-line fields. */
const CONTROL_CHARS = /[\x00-\x1f\x7f\u200b-\u200f\ufeff]/g;

/**
 * Trim a comma-separated keyword string to a character limit by dropping
 * trailing keywords at comma boundaries (never cuts a keyword mid-word).
 */
function trimKeywordsToLimit(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const truncated = text.slice(0, limit);
  const lastComma = truncated.lastIndexOf(",");
  return lastComma > 0 ? truncated.slice(0, lastComma) : truncated;
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
    "fix-keywords",
    "draft-reply",
    "draft-appeal",
    "draft-nomination",
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
  guidance: z.string().optional(),
  description: z.string().optional(),
  subtitle: z.string().optional(),
  forbiddenWords: z.array(z.string()).optional(),
  // draft-nomination fields
  versionString: z.string().optional(),
  whatsNew: z.string().optional(),
  promotionalText: z.string().optional(),
  isLaunch: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = await parseBody(request, requestSchema);
  if (parsed instanceof Response) return parsed;

  const {
    action, text, field, reviewTitle, rating, fromLocale, toLocale, locale,
    appName, charLimit, guidance, description, subtitle, forbiddenWords,
    versionString, whatsNew, promotionalText, isLaunch,
  } = parsed;

  // Copy needs no AI – echo the text back
  if (action === "copy") {
    return NextResponse.json({ result: text });
  }

  // Per-run guidance (from a dialog) overrides the saved setting; when absent
  // (e.g. magic wand) fall back to the saved guidance for this action's scope.
  const effectiveGuidance = (guidance ?? getAIGuidance(guidanceScopeForAction(action))).trim();
  const system = buildSystem(effectiveGuidance);

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
    case "fix-keywords": {
      if (!locale) {
        return NextResponse.json(
          { error: "locale is required for fix-keywords" },
          { status: 400 },
        );
      }
      prompt = buildFixKeywordsPrompt(
        text,
        locale,
        forbiddenWords ?? [],
        { ...context, description, subtitle },
      );
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
    case "draft-nomination": {
      prompt = buildNominationPrompt({
        appName,
        versionString: versionString ?? "",
        whatsNew: whatsNew ?? "",
        promotionalText: promotionalText ?? "",
        description: description ?? "",
        isLaunch: isLaunch ?? false,
      });
      break;
    }
  }

  // Append the user's guidance as a hard directive at the very end of the prompt
  // (recency + explicit framing) so specific rules like "use 'me', not 'us'" are
  // actually obeyed, not just nudged via the system message.
  if (effectiveGuidance) {
    prompt += `\n\nADDITIONAL INSTRUCTIONS FROM THE USER – follow these exactly, they override the defaults above:\n${effectiveGuidance}`;
  }

  try {
    const needsVariety = action === "draft-reply" || action === "draft-appeal";
    console.log("[ai] generateText: action=%s field=%s provider=%s model=%s", action, field, providerId, modelId);
    const t0 = Date.now();

    const { text: result } = await generateText({
      model,
      system,
      prompt,
      temperature: needsVariety ? 0.9 : 0,
      providerOptions: noThinkingOptions(providerId, modelId),
    });

    console.log("[ai] generateText: done in %dms, result length=%d", Date.now() - t0, result.length);

    // Detect conversational responses that slipped through the prompt constraints
    if (looksConversational(result)) {
      return NextResponse.json(
        { error: "The AI returned a conversational response instead of usable text. Please try again." },
        { status: 422 },
      );
    }

    // Strip control characters from single-line fields (name, subtitle, keywords).
    // LLMs (especially local models) sometimes output newlines or invisible chars.
    const singleLineField = field === "keywords" || field === "name" || field === "subtitle";
    let cleaned = singleLineField
      ? result.replace(CONTROL_CHARS, "").trim()
      : result;

    // For fix-keywords: split multi-word keywords first (Apple indexes words
    // individually), then strip forbidden words so individual words are caught.
    if (action === "fix-keywords") {
      // Split multi-word keywords: "clipboard history" → "clipboard,history"
      const splitWords = (s: string) =>
        s.split(",").flatMap((kw) => kw.trim().split(/\s+/)).filter(Boolean).join(",");

      cleaned = splitWords(result);

      if (forbiddenWords && forbiddenWords.length > 0) {
        const forbidden = new Set(forbiddenWords.map((w) => w.toLowerCase()));
        // Words from the original input are protected – only strip newly added ones
        const originals = new Set(
          text.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean),
        );
        const stripNewForbidden = (s: string) =>
          s.split(",").map((w) => w.trim())
            .filter((w) => w && (originals.has(w.toLowerCase()) || !forbidden.has(w.toLowerCase())))
            .join(",");

        cleaned = stripNewForbidden(cleaned);

        // If stripping left significant budget unused, retry with cleaned base
        const limit = charLimit ?? 100;
        if (cleaned.length < limit * 0.85) {
          console.log("[ai] fix-keywords: budget underused (%d/%d), retrying", cleaned.length, limit);
          const retryPrompt = buildFixKeywordsPrompt(
            cleaned, locale!, forbiddenWords, { field: "keywords", appName, charLimit, subtitle },
          );
          const { text: retry } = await generateText({
            model, system,
            prompt: retryPrompt, temperature: 0,
            providerOptions: noThinkingOptions(providerId, modelId),
          });
          if (!looksConversational(retry)) {
            cleaned = stripNewForbidden(splitWords(retry));
          }
        }
      }
    }

    // Character-limit handling.
    let finalResult = cleaned;
    let overLimit = false;

    if (charLimit && cleaned.length > charLimit) {
      if (field === "keywords") {
        // Keywords: dropping trailing keywords at comma boundaries keeps the
        // rest usable, so this is a safe silent trim.
        finalResult = trimKeywordsToLimit(cleaned, charLimit);
      } else {
        // Text fields: try once to shorten via the model, then surface the
        // result honestly instead of silently cutting it off mid-sentence.
        try {
          const { text: retry } = await generateText({
            model, system,
            prompt: buildShortenPrompt(cleaned, charLimit, field ?? ""),
            temperature: 0,
            providerOptions: noThinkingOptions(providerId, modelId),
          });
          const retryClean = singleLineField
            ? retry.replace(CONTROL_CHARS, "").trim()
            : retry;
          if (!looksConversational(retryClean) && retryClean.length < finalResult.length) {
            finalResult = retryClean;
          }
        } catch {
          // Keep the original over-limit result; it's reported below.
        }
        overLimit = finalResult.length > charLimit;
      }
    }

    console.log("[ai] returning result: action=%s length=%d overLimit=%s total=%dms", action, finalResult.length, overLimit, Date.now() - t0);

    return NextResponse.json({ result: finalResult, length: finalResult.length, overLimit });
  } catch (err) {
    console.error("[ai] error: action=%s field=%s", action, field, err);
    const category = classifyAIError(err);
    if (category === "auth" || category === "permission") {
      return NextResponse.json({ error: "ai_auth_error" }, { status: 401 });
    }
    return errorJson(err, 500, "AI request failed");
  }
}
