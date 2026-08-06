import { describe, it, expect } from "vitest";
import { noThinkingOptions, samplingTemperature } from "@/lib/ai/provider-options";

describe("noThinkingOptions", () => {
  it("sets low reasoning effort for OpenAI", () => {
    expect(noThinkingOptions("openai", "gpt-5.6-sol")).toEqual({
      openai: { reasoningEffort: "low" },
    });
  });

  it("sets low thinking level for Gemini 3.x models", () => {
    expect(noThinkingOptions("google", "gemini-3.1-pro-preview")).toEqual({
      google: { thinkingConfig: { thinkingLevel: "low" } },
    });
    expect(noThinkingOptions("google", "gemini-3.6-flash")).toEqual({
      google: { thinkingConfig: { thinkingLevel: "low" } },
    });
  });

  it("sets zero thinking budget for older Gemini models", () => {
    expect(noThinkingOptions("google", "gemini-2.5-flash")).toEqual({
      google: { thinkingConfig: { thinkingBudget: 0 } },
    });
  });

  it("returns no options for other providers", () => {
    expect(noThinkingOptions("anthropic", "claude-sonnet-5")).toEqual({});
    expect(noThinkingOptions("mistral", "mistral-large-latest")).toEqual({});
    expect(noThinkingOptions("local-openai", "some-model")).toEqual({});
  });
});

describe("samplingTemperature", () => {
  it("omits temperature for models that reject sampling parameters", () => {
    expect(samplingTemperature("anthropic", "claude-sonnet-5", 0)).toBeUndefined();
    expect(samplingTemperature("anthropic", "claude-opus-4-8", 0.9)).toBeUndefined();
    expect(samplingTemperature("openai", "gpt-5.6-sol", 0)).toBeUndefined();
  });

  it("passes temperature through for models that accept it", () => {
    expect(samplingTemperature("anthropic", "claude-haiku-4-5", 0)).toBe(0);
    expect(samplingTemperature("google", "gemini-3.6-flash", 0.9)).toBe(0.9);
    expect(samplingTemperature("mistral", "mistral-large-latest", 0)).toBe(0);
  });

  it("passes temperature through for legacy stored models not in the picker", () => {
    expect(samplingTemperature("anthropic", "claude-sonnet-4-6", 0)).toBe(0);
    expect(samplingTemperature("local-openai", "custom-model", 0.9)).toBe(0.9);
  });
});
