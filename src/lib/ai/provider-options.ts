import { isReasoningModel } from "@/lib/ai-providers";

export type NoThinkingProviderOptions = Record<
  string,
  Record<string, string | number | Record<string, string | number>>
>;

/**
 * Provider-specific options to minimise reasoning/thinking overhead.
 * Our use cases (translation, copywriting, keywords, insights) don't benefit
 * from chain-of-thought, so we disable or minimise it for every provider.
 */
export function noThinkingOptions(
  providerId: string,
  modelId: string,
): NoThinkingProviderOptions {
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

/**
 * Temperature to send for a model, or undefined for reasoning models that
 * reject sampling parameters (the Anthropic and OpenAI APIs return 400 when
 * temperature is sent to them).
 */
export function samplingTemperature(
  providerId: string,
  modelId: string,
  temperature: number,
): number | undefined {
  return isReasoningModel(providerId, modelId) ? undefined : temperature;
}
