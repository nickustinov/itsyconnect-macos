import { describe, it, expect } from "vitest";
import { AI_PROVIDERS } from "@/lib/ai-providers";
import type { AIProvider, AIModel } from "@/lib/ai-providers";

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
