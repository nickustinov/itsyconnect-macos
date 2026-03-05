import type { LanguageModel } from "ai";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createMistral } from "@ai-sdk/mistral";
import { getAISettings } from "./settings";
import {
  isLocalOpenAIProvider,
  resolveLocalOpenAIApiKey,
  resolveLocalOpenAIBaseUrl,
} from "./local-provider";

/** Create a Vercel AI SDK LanguageModel from stored AI settings. */
export async function getLanguageModel(): Promise<LanguageModel> {
  const settings = await getAISettings();
  if (!settings) {
    throw new Error("AI not configured");
  }

  return createLanguageModel(
    settings.provider,
    settings.modelId,
    settings.apiKey,
    settings.baseUrl ?? undefined,
  );
}

export function createLanguageModel(
  provider: string,
  modelId: string,
  apiKey: string,
  baseUrl?: string,
): LanguageModel {
  if (isLocalOpenAIProvider(provider)) {
    const openaiCompatible = createOpenAI({
      apiKey: resolveLocalOpenAIApiKey(apiKey),
      baseURL: resolveLocalOpenAIBaseUrl(baseUrl),
    });
    return openaiCompatible(modelId);
  }

  switch (provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelId);
    }
    case "openai": {
      const openai = createOpenAI({ apiKey });
      return openai(modelId);
    }
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }
    case "xai": {
      const xai = createXai({ apiKey });
      return xai(modelId);
    }
    case "mistral": {
      const mistral = createMistral({ apiKey });
      return mistral(modelId);
    }
    case "deepseek": {
      const deepseek = createOpenAI({
        apiKey,
        baseURL: "https://api.deepseek.com/v1",
      });
      return deepseek(modelId);
    }
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

export type AIErrorCategory = "auth" | "permission" | "model_not_found" | "rate_limit" | "unknown";

/** Classify an AI provider error by inspecting its message. */
export function classifyAIError(err: unknown): AIErrorCategory {
  const message = err instanceof Error ? err.message : String(err);
  if (/401|unauthorized|invalid.*key|invalid.*api|incorrect.*key|authentication/i.test(message)) {
    return "auth";
  }
  if (/403|forbidden|permission/i.test(message)) {
    return "permission";
  }
  if (/404|not.found|model/i.test(message)) {
    return "model_not_found";
  }
  if (/429|rate.limit|quota/i.test(message)) {
    return "rate_limit";
  }
  return "unknown";
}

const ERROR_MESSAGES: Record<AIErrorCategory, string | null> = {
  auth: "Invalid API key",
  permission: "API key lacks required permissions",
  model_not_found: "Model not found – check your provider and model selection",
  rate_limit: null, // Rate limited but key is valid
  unknown: null, // Handled separately with original message
};

/**
 * Validate an API key by making a minimal test call to the provider.
 * Returns null if valid, or an error message string if invalid.
 */
export async function validateApiKey(
  provider: string,
  modelId: string,
  apiKey: string,
  baseUrl?: string,
): Promise<string | null> {
  try {
    const model = createLanguageModel(provider, modelId, apiKey, baseUrl);
    await generateText({
      model,
      prompt: "Say hi",
      maxOutputTokens: 16,
    });
    return null;
  } catch (err) {
    const category = classifyAIError(err);
    if (category === "rate_limit") return null;
    const mapped = ERROR_MESSAGES[category];
    if (mapped) return mapped;
    if (isLocalOpenAIProvider(provider)) {
      return "Could not reach the local AI server. Ensure it is running and the URL/model are correct.";
    }
    const message = err instanceof Error ? err.message : String(err);
    return `API key validation failed: ${message}`;
  }
}
