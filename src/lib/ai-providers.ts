export interface AIModel {
  id: string;
  name: string;
  /** Reasoning models don't support sampling parameters like temperature. */
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
    id: "local-openai",
    name: "Local server (OpenAI-compatible)",
    envVar: "LOCAL_OPENAI_API_KEY",
    models: [
      { id: "local-model", name: "Custom model ID" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    models: [
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    envVar: "OPENAI_API_KEY",
    models: [
      { id: "gpt-5.2", name: "GPT-5.2", reasoning: true },
      { id: "gpt-5", name: "GPT-5", reasoning: true },
      { id: "gpt-5-mini", name: "GPT-5 Mini", reasoning: true },
    ],
  },
  {
    id: "google",
    name: "Google",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    models: [
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    ],
  },
  {
    id: "xai",
    name: "xAI",
    envVar: "XAI_API_KEY",
    models: [
      { id: "grok-4-1", name: "Grok 4.1" },
      { id: "grok-4", name: "Grok 4" },
      { id: "grok-3", name: "Grok 3" },
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
      { id: "deepseek-chat", name: "DeepSeek Chat" },
      { id: "deepseek-reasoner", name: "DeepSeek Reasoner", reasoning: true },
    ],
  },
];

/** Check whether a provider+model combination is a reasoning model. */
export function isReasoningModel(providerId: string, modelId: string): boolean {
  const provider = AI_PROVIDERS.find((p) => p.id === providerId);
  const model = provider?.models.find((m) => m.id === modelId);
  return model?.reasoning === true;
}
