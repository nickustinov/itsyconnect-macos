import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateText = vi.fn();
const mockCreateLanguageModel = vi.fn();
const mockClassifyAIError = vi.fn();
const mockGetAISettings = vi.fn();
const mockEnsureLocalModelLoaded = vi.fn();
const mockIsLocalOpenAIProvider = vi.fn();
const mockBuildTranslatePrompt = vi.fn();
const mockBuildImprovePrompt = vi.fn();
const mockBuildReplyPrompt = vi.fn();
const mockBuildAppealPrompt = vi.fn();
const mockBuildFixKeywordsPrompt = vi.fn();
const mockBuildNominationPrompt = vi.fn();
const mockBuildShortenPrompt = vi.fn();
const mockGetAIGuidance = vi.fn();
const mockErrorJson = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

vi.mock("@/lib/app-preferences", () => ({
  getAIGuidance: () => mockGetAIGuidance(),
}));

vi.mock("@/lib/ai/provider-factory", () => ({
  createLanguageModel: (...args: unknown[]) => mockCreateLanguageModel(...args),
  classifyAIError: (...args: unknown[]) => mockClassifyAIError(...args),
}));

vi.mock("@/lib/ai/settings", () => ({
  getAISettings: () => mockGetAISettings(),
}));

vi.mock("@/lib/ai/local-provider", () => ({
  ensureLocalModelLoaded: (...args: unknown[]) => mockEnsureLocalModelLoaded(...args),
  isLocalOpenAIProvider: (...args: unknown[]) => mockIsLocalOpenAIProvider(...args),
}));

vi.mock("@/lib/ai/prompts", () => ({
  buildTranslatePrompt: (...args: unknown[]) => mockBuildTranslatePrompt(...args),
  buildImprovePrompt: (...args: unknown[]) => mockBuildImprovePrompt(...args),
  buildReplyPrompt: (...args: unknown[]) => mockBuildReplyPrompt(...args),
  buildAppealPrompt: (...args: unknown[]) => mockBuildAppealPrompt(...args),
  buildFixKeywordsPrompt: (...args: unknown[]) => mockBuildFixKeywordsPrompt(...args),
  buildNominationPrompt: (...args: unknown[]) => mockBuildNominationPrompt(...args),
  buildShortenPrompt: (...args: unknown[]) => mockBuildShortenPrompt(...args),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    errorJson: (...args: unknown[]) => mockErrorJson(...args),
  };
});

describe("AI route", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
    mockGenerateText.mockResolvedValue({ text: "Generated output" });
    mockCreateLanguageModel.mockReset();
    mockCreateLanguageModel.mockReturnValue({ id: "model" });
    mockClassifyAIError.mockReset();
    mockClassifyAIError.mockReturnValue("unknown");
    mockGetAISettings.mockReset();
    mockGetAISettings.mockResolvedValue({
      provider: "openai",
      modelId: "gpt-4.1-mini",
      apiKey: "sk-test",
    });
    mockEnsureLocalModelLoaded.mockReset();
    mockEnsureLocalModelLoaded.mockResolvedValue(null);
    mockIsLocalOpenAIProvider.mockReset();
    mockIsLocalOpenAIProvider.mockReturnValue(false);
    mockBuildTranslatePrompt.mockReset();
    mockBuildTranslatePrompt.mockReturnValue("translate-prompt");
    mockBuildImprovePrompt.mockReset();
    mockBuildImprovePrompt.mockReturnValue("improve-prompt");
    mockBuildReplyPrompt.mockReset();
    mockBuildReplyPrompt.mockReturnValue("reply-prompt");
    mockBuildAppealPrompt.mockReset();
    mockBuildAppealPrompt.mockReturnValue("appeal-prompt");
    mockBuildFixKeywordsPrompt.mockReset();
    mockBuildFixKeywordsPrompt.mockReturnValue("keywords-prompt");
    mockBuildNominationPrompt.mockReset();
    mockBuildNominationPrompt.mockReturnValue("nomination-prompt");
    mockBuildShortenPrompt.mockReset();
    mockBuildShortenPrompt.mockReturnValue("shorten-prompt");
    mockGetAIGuidance.mockReset();
    mockGetAIGuidance.mockReturnValue("");
    mockErrorJson.mockReset();
    mockErrorJson.mockImplementation(
      (_err, status = 500, fallback = "mapped") =>
        new Response(JSON.stringify({ error: fallback }), { status: status as number }),
    );
    vi.resetModules();
  });

  it("returns the input unchanged for copy actions", async () => {
    const { POST } = await import("@/app/api/ai/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "copy", text: "keep me" }),
      }),
    );

    expect(await response.json()).toEqual({ result: "keep me" });
    expect(mockGetAISettings).not.toHaveBeenCalled();
  });

  it("returns ai_not_configured when AI settings are missing", async () => {
    const { POST } = await import("@/app/api/ai/route");
    mockGetAISettings.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "improve", text: "hello", locale: "en-US" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "ai_not_configured" });
  });

  it("returns local model load errors before generation", async () => {
    const { POST } = await import("@/app/api/ai/route");
    mockGetAISettings.mockResolvedValue({
      provider: "local-openai",
      modelId: "qwen",
      apiKey: "local-key",
      baseUrl: "http://localhost:1234/v1",
    });
    mockIsLocalOpenAIProvider.mockImplementation((provider) => provider === "local-openai");
    mockEnsureLocalModelLoaded.mockResolvedValue("model not loaded");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "improve", text: "hello", locale: "en-US" }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "model not loaded" });
  });

  it("validates required locales for translate", async () => {
    const { POST } = await import("@/app/api/ai/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "translate", text: "hello" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "fromLocale and toLocale are required for translate",
    });
  });

  it("builds translate and appeal prompts for those actions", async () => {
    const { POST } = await import("@/app/api/ai/route");

    const translate = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "translate",
          text: "hello",
          fromLocale: "en-US",
          toLocale: "fr-FR",
          field: "description",
          appName: "Itsy",
          charLimit: 30,
        }),
      }),
    );
    expect(mockBuildTranslatePrompt).toHaveBeenCalledWith(
      "hello",
      "en-US",
      "fr-FR",
      { field: "description", appName: "Itsy", charLimit: 30 },
    );
    expect((await translate.json()).result).toBe("Generated output");

    const appeal = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft-appeal",
          text: "Rejected",
          reviewTitle: "Metadata rejected",
          rating: 2,
          appName: "Itsy",
        }),
      }),
    );
    expect(mockBuildAppealPrompt).toHaveBeenCalledWith(
      "Metadata rejected",
      "Rejected",
      2,
      "Itsy",
    );
    expect((await appeal.json()).result).toBe("Generated output");
  });

  it("validates locale for improve and fix-keywords", async () => {
    const { POST } = await import("@/app/api/ai/route");

    const improve = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "improve", text: "hello" }),
      }),
    );
    expect(improve.status).toBe(400);
    expect(await improve.json()).toEqual({ error: "locale is required for improve" });

    const keywords = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fix-keywords", text: "one,two" }),
      }),
    );
    expect(keywords.status).toBe(400);
    expect(await keywords.json()).toEqual({ error: "locale is required for fix-keywords" });
  });

  it("rejects conversational AI responses", async () => {
    const { POST } = await import("@/app/api/ai/route");
    mockGenerateText.mockResolvedValue({ text: "Sure, here's a better version." });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "improve", text: "hello", locale: "en-US" }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "The AI returned a conversational response instead of usable text. Please try again.",
    });
  });

  it("cleans and retries fix-keywords outputs when forbidden words underuse the budget", async () => {
    const { POST } = await import("@/app/api/ai/route");
    mockGenerateText
      .mockResolvedValueOnce({ text: "clipboard history,forbidden,new term" })
      .mockResolvedValueOnce({ text: "clipboard history,safe extra" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fix-keywords",
          text: "clipboard history",
          locale: "en-US",
          charLimit: 40,
          forbiddenWords: ["forbidden"],
          subtitle: "subtitle",
        }),
      }),
    );

    expect(mockBuildFixKeywordsPrompt).toHaveBeenNthCalledWith(
      1,
      "clipboard history",
      "en-US",
      ["forbidden"],
      expect.objectContaining({ subtitle: "subtitle" }),
    );
    expect(mockBuildFixKeywordsPrompt).toHaveBeenNthCalledWith(
      2,
      "clipboard,history,new,term",
      "en-US",
      ["forbidden"],
      expect.objectContaining({ field: "keywords" }),
    );
    expect((await response.json()).result).toBe("clipboard,history,safe,extra");
  });

  it("truncates keyword results to the last full comma boundary", async () => {
    const { POST } = await import("@/app/api/ai/route");
    mockGenerateText.mockResolvedValue({ text: "alpha,beta,gamma,delta" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fix-keywords",
          text: "alpha",
          locale: "en-US",
          charLimit: 12,
          field: "keywords",
        }),
      }),
    );

    expect((await response.json()).result).toBe("alpha,beta");
  });

  it("uses the reply and nomination prompts for their respective actions", async () => {
    const { POST } = await import("@/app/api/ai/route");

    const reply = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft-reply",
          text: "Needs work",
          reviewTitle: "Bad",
          rating: 1,
          appName: "Itsy",
        }),
      }),
    );
    expect(mockBuildReplyPrompt).toHaveBeenCalledWith("Bad", "Needs work", 1, "Itsy");
    expect((await reply.json()).result).toBe("Generated output");

    const nomination = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft-nomination",
          text: "",
          appName: "Itsy",
          versionString: "1.2",
          whatsNew: "New things",
          promotionalText: "Promo",
          description: "Desc",
          isLaunch: true,
        }),
      }),
    );
    expect(mockBuildNominationPrompt).toHaveBeenCalledWith({
      appName: "Itsy",
      versionString: "1.2",
      whatsNew: "New things",
      promotionalText: "Promo",
      description: "Desc",
      isLaunch: true,
    });
    expect((await nomination.json()).result).toBe("Generated output");
  });

  it("maps auth failures to ai_auth_error", async () => {
    const { POST } = await import("@/app/api/ai/route");
    mockGenerateText.mockRejectedValue(new Error("auth"));
    mockClassifyAIError.mockReturnValue("auth");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "improve", text: "hello", locale: "en-US" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "ai_auth_error" });
  });

  it("uses errorJson for non-auth AI failures", async () => {
    const { POST } = await import("@/app/api/ai/route");
    mockGenerateText.mockRejectedValue(new Error("boom"));

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "improve", text: "hello", locale: "en-US" }),
      }),
    );

    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error), 500, "AI request failed");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "AI request failed" });
  });

  it("passes google thinkingLevel low for gemini-3 models", async () => {
    const { POST } = await import("@/app/api/ai/route");
    mockGetAISettings.mockResolvedValue({
      provider: "google",
      modelId: "gemini-3-pro",
      apiKey: "gk-test",
    });

    await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "improve", text: "hello", locale: "en-US" }),
      }),
    );

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
      }),
    );
  });

  it("passes google thinkingBudget 0 for non-gemini-3 google models", async () => {
    const { POST } = await import("@/app/api/ai/route");
    mockGetAISettings.mockResolvedValue({
      provider: "google",
      modelId: "gemini-2.5-flash",
      apiKey: "gk-test",
    });

    await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "improve", text: "hello", locale: "en-US" }),
      }),
    );

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      }),
    );
  });

  it("passes empty providerOptions for unknown providers", async () => {
    const { POST } = await import("@/app/api/ai/route");
    mockGetAISettings.mockResolvedValue({
      provider: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      apiKey: "sk-test",
    });

    await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "improve", text: "hello", locale: "en-US" }),
      }),
    );

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: {},
      }),
    );
  });

  it("uses the base system prompt with no guidance set", async () => {
    const { POST } = await import("@/app/api/ai/route");

    await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "improve", text: "hello", locale: "en-US" }),
      }),
    );

    const call = mockGenerateText.mock.calls[0][0] as { system: string; prompt: string };
    expect(call.system).toContain("You are a text-processing tool.");
    expect(call.system).not.toContain("standing instructions");
    expect(call.prompt).not.toContain("ADDITIONAL INSTRUCTIONS");
  });

  it("appends per-request guidance to the system and the prompt", async () => {
    const { POST } = await import("@/app/api/ai/route");

    await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "translate",
          text: "hello",
          fromLocale: "en-US",
          toLocale: "de-DE",
          field: "description",
          guidance: "use an informal tone (du)",
        }),
      }),
    );

    const call = mockGenerateText.mock.calls[0][0] as { system: string; prompt: string };
    expect(call.system).toContain("standing instructions");
    expect(call.system).toContain("use an informal tone (du)");
    expect(call.prompt).toContain("ADDITIONAL INSTRUCTIONS");
    expect(call.prompt).toContain("use an informal tone (du)");
    expect(mockGetAIGuidance).not.toHaveBeenCalled();
  });

  it("falls back to the global guidance when none is in the request", async () => {
    mockGetAIGuidance.mockReturnValue("write in British English");
    const { POST } = await import("@/app/api/ai/route");

    await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft-reply",
          text: "Needs work",
          reviewTitle: "Bad",
          rating: 1,
        }),
      }),
    );

    const call = mockGenerateText.mock.calls[0][0] as { system: string; prompt: string };
    expect(call.system).toContain("write in British English");
    expect(call.prompt).toContain("write in British English");
  });

  it("reshortens an over-limit text field when the retry fits", async () => {
    const { POST } = await import("@/app/api/ai/route");
    // First call: 23 chars (over the 20 limit). Reshorten retry: 12 chars (fits).
    mockGenerateText
      .mockResolvedValueOnce({ text: "way too long subtitle!!" })
      .mockResolvedValueOnce({ text: "short enough" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "improve",
          text: "hello",
          locale: "en-US",
          charLimit: 20,
          field: "subtitle",
        }),
      }),
    );

    expect(mockBuildShortenPrompt).toHaveBeenCalled();
    const data = await response.json();
    expect(data.result).toBe("short enough");
    expect(data.length).toBe(12);
    expect(data.overLimit).toBe(false);
  });

  it("reports an over-limit text field instead of silently truncating", async () => {
    const { POST } = await import("@/app/api/ai/route");
    // Both the initial generation and the reshorten retry stay over the limit.
    mockGenerateText.mockResolvedValue({ text: "this subtitle is still way too long" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "improve",
          text: "hello",
          locale: "en-US",
          charLimit: 20,
          field: "subtitle",
        }),
      }),
    );

    const data = await response.json();
    // Returned in full (not cut off), but flagged as over the limit.
    expect(data.result).toBe("this subtitle is still way too long");
    expect(data.length).toBe(35);
    expect(data.overLimit).toBe(true);
  });

  it("includes length and overLimit:false for within-limit results", async () => {
    const { POST } = await import("@/app/api/ai/route");
    mockGenerateText.mockResolvedValue({ text: "Short" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "translate",
          text: "hello",
          fromLocale: "en-US",
          toLocale: "fr-FR",
          field: "subtitle",
          charLimit: 30,
        }),
      }),
    );

    const data = await response.json();
    expect(data).toEqual({ result: "Short", length: 5, overLimit: false });
  });
});
