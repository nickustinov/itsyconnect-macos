import { describe, it, expect } from "vitest";
import { AI_PROVIDERS, isReasoningModel } from "@/lib/ai-providers";

describe("AI_PROVIDERS", () => {
  it("exports a non-empty array of providers", () => {
    expect(AI_PROVIDERS).toBeInstanceOf(Array);
    expect(AI_PROVIDERS.length).toBeGreaterThan(0);
  });

  it("has no duplicate provider IDs", () => {
    const ids = AI_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no duplicate model IDs across all providers", () => {
    const modelIds = AI_PROVIDERS.flatMap((p) => p.models.map((m) => m.id));
    expect(new Set(modelIds).size).toBe(modelIds.length);
  });

  it("every provider has required fields", () => {
    for (const provider of AI_PROVIDERS) {
      expect(provider.id).toBeTruthy();
      expect(provider.name).toBeTruthy();
      expect(provider.envVar).toBeTruthy();
      expect(provider.models.length).toBeGreaterThan(0);
    }
  });

  it("every model has required fields", () => {
    for (const provider of AI_PROVIDERS) {
      for (const model of provider.models) {
        expect(model.id).toBeTruthy();
        expect(model.name).toBeTruthy();
      }
    }
  });

  it("every envVar ends with _API_KEY", () => {
    for (const provider of AI_PROVIDERS) {
      expect(provider.envVar).toMatch(/_API_KEY$/);
    }
  });
});

describe("isReasoningModel", () => {
  it("returns true for models that reject sampling parameters", () => {
    expect(isReasoningModel("openai", "gpt-5.6-sol")).toBe(true);
    expect(isReasoningModel("openai", "gpt-5.6-terra")).toBe(true);
    expect(isReasoningModel("openai", "gpt-5.6-luna")).toBe(true);
    expect(isReasoningModel("anthropic", "claude-sonnet-5")).toBe(true);
    expect(isReasoningModel("anthropic", "claude-opus-4-8")).toBe(true);
  });

  it("returns false for models that accept sampling parameters", () => {
    expect(isReasoningModel("anthropic", "claude-haiku-4-5")).toBe(false);
    expect(isReasoningModel("google", "gemini-3.1-pro-preview")).toBe(false);
    expect(isReasoningModel("deepseek", "deepseek-v4-flash")).toBe(false);
    expect(isReasoningModel("xai", "grok-4.5")).toBe(false);
    expect(isReasoningModel("mistral", "mistral-large-latest")).toBe(false);
  });

  it("returns false for unknown provider or model", () => {
    expect(isReasoningModel("unknown", "model")).toBe(false);
    expect(isReasoningModel("openai", "unknown-model")).toBe(false);
    // Legacy stored models that are no longer in the picker keep temperature
    expect(isReasoningModel("anthropic", "claude-sonnet-4-6")).toBe(false);
  });
});
