export interface AIModel {
  id: string;
  name: string;
  /** Reasoning models reject sampling parameters like temperature. */
  reasoning?: boolean;
}

export interface AIProvider {
  id: string;
  name: string;
  envVar: string;
  models: AIModel[];
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    models: [
      { id: "claude-sonnet-5", name: "Claude Sonnet 5", reasoning: true },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
      { id: "claude-opus-4-8", name: "Claude Opus 4.8", reasoning: true },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    envVar: "OPENAI_API_KEY",
    models: [
      { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", reasoning: true },
      { id: "gpt-5.6-terra", name: "GPT-5.6 Terra", reasoning: true },
      { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", reasoning: true },
    ],
  },
  {
    id: "google",
    name: "Google",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    models: [
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
      { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
      { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite" },
    ],
  },
  {
    id: "xai",
    name: "xAI",
    envVar: "XAI_API_KEY",
    models: [
      { id: "grok-4.5", name: "Grok 4.5" },
      { id: "grok-4.3", name: "Grok 4.3" },
    ],
  },
  {
    id: "mistral",
    name: "Mistral",
    envVar: "MISTRAL_API_KEY",
    models: [
      { id: "mistral-large-latest", name: "Mistral Large" },
      { id: "mistral-medium-latest", name: "Mistral Medium" },
      { id: "mistral-small-latest", name: "Mistral Small" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    envVar: "DEEPSEEK_API_KEY",
    models: [
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
    ],
  },
  {
    id: "local-openai",
    name: "Local server (OpenAI-compatible)",
    envVar: "LOCAL_OPENAI_API_KEY",
    models: [
      { id: "local-model", name: "Custom model ID" },
    ],
  },
];

/** Check whether a provider+model combination is a reasoning model. */
export function isReasoningModel(providerId: string, modelId: string): boolean {
  const provider = AI_PROVIDERS.find((p) => p.id === providerId);
  const model = provider?.models.find((m) => m.id === modelId);
  return model?.reasoning === true;
}
