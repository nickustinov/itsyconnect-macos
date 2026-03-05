import { describe, it, expect, vi } from "vitest";
import { createLanguageModel, validateApiKey, getLanguageModel, classifyAIError } from "@/lib/ai/provider-factory";
import { DEFAULT_LOCAL_OPENAI_BASE_URL } from "@/lib/ai/local-provider";

// The LanguageModel type is a union; runtime objects have modelId/provider
// but TS can't see them on every union member. Cast to Record for assertions.

describe("createLanguageModel", () => {
  it("creates an Anthropic model", () => {
    const model = createLanguageModel("anthropic", "claude-sonnet-4-6", "sk-test") as Record<string, unknown>;
    expect(model.modelId).toBe("claude-sonnet-4-6");
    expect(model.provider).toBe("anthropic.messages");
  });

  it("creates an OpenAI model", () => {
    const model = createLanguageModel("openai", "gpt-5.2", "sk-test") as Record<string, unknown>;
    expect(model.modelId).toBe("gpt-5.2");
    expect(model.provider).toContain("openai");
  });

  it("creates a Google model", () => {
    const model = createLanguageModel("google", "gemini-3-pro-preview", "test-key") as Record<string, unknown>;
    expect(model.modelId).toBe("gemini-3-pro-preview");
    expect(model.provider).toContain("google");
  });

  it("creates an xAI model", () => {
    const model = createLanguageModel("xai", "grok-4-1", "xai-test") as Record<string, unknown>;
    expect(model.modelId).toBe("grok-4-1");
    expect(model.provider).toContain("xai");
  });

  it("creates a Mistral model", () => {
    const model = createLanguageModel("mistral", "mistral-large-latest", "test-key") as Record<string, unknown>;
    expect(model.modelId).toBe("mistral-large-latest");
    expect(model.provider).toContain("mistral");
  });

  it("creates a DeepSeek model via OpenAI-compatible adapter", () => {
    const model = createLanguageModel("deepseek", "deepseek-chat", "ds-test") as Record<string, unknown>;
    expect(model.modelId).toBe("deepseek-chat");
    expect(model.provider).toContain("openai");
  });

  it("creates a local OpenAI-compatible model", () => {
    const model = createLanguageModel("local-openai", "qwen2.5-7b-instruct", "", DEFAULT_LOCAL_OPENAI_BASE_URL) as Record<string, unknown>;
    expect(model.modelId).toBe("qwen2.5-7b-instruct");
    expect(model.provider).toContain("openai");
  });

  it("throws for unknown provider", () => {
    expect(() => createLanguageModel("unknown", "model", "key")).toThrow(
      "Unknown AI provider: unknown",
    );
  });
});

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai/settings", () => ({
  getAISettings: vi.fn(),
}));

describe("getLanguageModel", () => {
  it("creates a model from stored settings", async () => {
    const { getAISettings } = await import("@/lib/ai/settings");
    vi.mocked(getAISettings).mockResolvedValueOnce({
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      baseUrl: null,
      apiKey: "sk-test",
    });

    const model = await getLanguageModel() as Record<string, unknown>;
    expect(model.modelId).toBe("claude-sonnet-4-6");
  });

  it("throws when AI is not configured", async () => {
    const { getAISettings } = await import("@/lib/ai/settings");
    vi.mocked(getAISettings).mockResolvedValueOnce(null);

    await expect(getLanguageModel()).rejects.toThrow("AI not configured");
  });
});

describe("classifyAIError", () => {
  it("returns 'auth' for 401/unauthorized errors", () => {
    expect(classifyAIError(new Error("401 Unauthorized"))).toBe("auth");
    expect(classifyAIError(new Error("invalid api key"))).toBe("auth");
    expect(classifyAIError(new Error("Incorrect API key provided"))).toBe("auth");
    expect(classifyAIError(new Error("authentication failed"))).toBe("auth");
  });

  it("returns 'permission' for 403/forbidden errors", () => {
    expect(classifyAIError(new Error("403 Forbidden"))).toBe("permission");
    expect(classifyAIError(new Error("permission denied"))).toBe("permission");
  });

  it("returns 'model_not_found' for 404/model errors", () => {
    expect(classifyAIError(new Error("404 model not found"))).toBe("model_not_found");
  });

  it("returns 'rate_limit' for 429/quota errors", () => {
    expect(classifyAIError(new Error("429 rate limit exceeded"))).toBe("rate_limit");
    expect(classifyAIError(new Error("quota exceeded"))).toBe("rate_limit");
  });

  it("returns 'unknown' for unrecognized errors", () => {
    expect(classifyAIError(new Error("connection timeout"))).toBe("unknown");
  });

  it("handles non-Error values", () => {
    expect(classifyAIError("401 unauthorized")).toBe("auth");
    expect(classifyAIError("something went wrong")).toBe("unknown");
  });
});

describe("validateApiKey", () => {
  it("returns null when API call succeeds", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValueOnce({ text: "hi" } as never);

    const result = await validateApiKey("anthropic", "claude-sonnet-4-6", "sk-valid");
    expect(result).toBeNull();
  });

  it("returns 'Invalid API key' for 401 errors", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockRejectedValueOnce(new Error("401 Unauthorized"));

    const result = await validateApiKey("anthropic", "claude-sonnet-4-6", "sk-bad");
    expect(result).toBe("Invalid API key");
  });

  it("returns 'Invalid API key' for invalid key message", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockRejectedValueOnce(new Error("invalid api key"));

    const result = await validateApiKey("openai", "gpt-5.2", "sk-bad");
    expect(result).toBe("Invalid API key");
  });

  it("returns null for rate limit errors (key is valid)", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockRejectedValueOnce(new Error("429 rate limit exceeded"));

    const result = await validateApiKey("anthropic", "claude-sonnet-4-6", "sk-valid");
    expect(result).toBeNull();
  });

  it("returns permission error for 403", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockRejectedValueOnce(new Error("403 Forbidden"));

    const result = await validateApiKey("anthropic", "claude-sonnet-4-6", "sk-noperms");
    expect(result).toBe("API key lacks required permissions");
  });

  it("returns model not found for 404", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockRejectedValueOnce(new Error("404 model not found"));

    const result = await validateApiKey("anthropic", "bad-model", "sk-valid");
    expect(result).toBe("Model not found – check your provider and model selection");
  });

  it("returns generic error for unknown failures", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockRejectedValueOnce(new Error("connection timeout"));

    const result = await validateApiKey("anthropic", "claude-sonnet-4-6", "sk-valid");
    expect(result).toBe("API key validation failed: connection timeout");
  });

  it("handles non-Error thrown values", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockRejectedValueOnce("string error");

    const result = await validateApiKey("anthropic", "claude-sonnet-4-6", "sk-valid");
    expect(result).toBe("API key validation failed: string error");
  });
});
