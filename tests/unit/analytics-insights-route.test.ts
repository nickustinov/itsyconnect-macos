import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateLanguageModel = vi.fn();
const mockClassifyAIError = vi.fn();
const mockGetAISettings = vi.fn();
const mockEnsureLocalModelLoaded = vi.fn();
const mockIsLocalOpenAIProvider = vi.fn();
const mockBuildAnalyticsInsightsPrompt = vi.fn();
const mockGenerateObjectWithRepair = vi.fn();
const mockHasCredentials = vi.fn();
const mockIsDemoMode = vi.fn();
const mockGetDemoAnalytics = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockErrorJson = vi.fn();

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
  buildAnalyticsInsightsPrompt: (...args: unknown[]) => mockBuildAnalyticsInsightsPrompt(...args),
}));

vi.mock("@/lib/ai/structured-output", () => ({
  generateObjectWithRepair: (...args: unknown[]) => mockGenerateObjectWithRepair(...args),
}));

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: () => mockHasCredentials(),
}));

vi.mock("@/lib/demo", () => ({
  isDemoMode: () => mockIsDemoMode(),
  getDemoAnalytics: (...args: unknown[]) => mockGetDemoAnalytics(...args),
}));

vi.mock("@/lib/cache", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    errorJson: (...args: unknown[]) => mockErrorJson(...args),
  };
});

const analyticsData = {
  dailyDownloads: [
    { date: "2026-03-01", firstTime: 2 },
    { date: "2026-03-02", firstTime: 3 },
  ],
  dailyRevenue: [{ date: "2026-03-02", proceeds: 12.5 }],
};

describe("analytics insights route", () => {
  beforeEach(() => {
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
    mockBuildAnalyticsInsightsPrompt.mockReset();
    mockBuildAnalyticsInsightsPrompt.mockReturnValue("prompt");
    mockGenerateObjectWithRepair.mockReset();
    mockGenerateObjectWithRepair.mockResolvedValue({
      object: {
        highlights: ["Growth"],
        opportunities: ["ASO"],
      },
    });
    mockHasCredentials.mockReset();
    mockHasCredentials.mockReturnValue(true);
    mockIsDemoMode.mockReset();
    mockIsDemoMode.mockReturnValue(false);
    mockGetDemoAnalytics.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockErrorJson.mockReset();
    mockErrorJson.mockImplementation(
      (_err, status = 500, fallback = "mapped") =>
        new Response(JSON.stringify({ error: fallback }), { status: status as number }),
    );
    vi.resetModules();
  });

  it("GET returns cached insights when present", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce({
      insights: { highlights: ["Growth"], opportunities: ["ASO"] },
      dataHash: "hash-1",
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(await response.json()).toEqual({
      insights: { highlights: ["Growth"], opportunities: ["ASO"] },
      dataHash: "hash-1",
      cached: true,
    });
  });

  it("GET returns an empty cache response when nothing is stored", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(await response.json()).toEqual({ insights: null, cached: false });
  });

  it("POST uses demo analytics data in demo mode", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoAnalytics.mockReturnValue(analyticsData);
    mockCacheGet.mockReturnValueOnce(null); // no cached insights

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockGetDemoAnalytics).toHaveBeenCalledWith("app-1");
    expect(await response.json()).toEqual({
      insights: { highlights: ["Growth"], opportunities: ["ASO"] },
      dataHash: "2:2026-03-02:5:12.5",
      cached: false,
    });
  });

  it("POST returns errorJson when data fetching throws", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockImplementation(() => {
      throw new Error("cache read failed");
    });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error));
    expect(response.status).toBe(500);
  });

  it("POST rejects requests without ASC credentials", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockHasCredentials.mockReturnValue(false);

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No ASC credentials" });
  });

  it("POST rejects requests without analytics data", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce({ dailyDownloads: [], dailyRevenue: [] });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No analytics data available" });
  });

  it("POST returns cached insights when the analytics hash matches and force is not set", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet
      .mockReturnValueOnce(analyticsData)
      .mockReturnValueOnce({
        insights: { highlights: ["Growth"], opportunities: ["ASO"] },
        dataHash: "2:2026-03-02:5:12.5",
      });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(await response.json()).toEqual({
      insights: { highlights: ["Growth"], opportunities: ["ASO"] },
      dataHash: "2:2026-03-02:5:12.5",
      cached: true,
    });
    expect(mockGenerateObjectWithRepair).not.toHaveBeenCalled();
  });

  it("POST returns a local model load error before generating insights", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGetAISettings.mockResolvedValue({
      provider: "local-openai",
      modelId: "qwen",
      apiKey: "local-key",
      baseUrl: "http://localhost:1234/v1",
    });
    mockIsLocalOpenAIProvider.mockImplementation((provider) => provider === "local-openai");
    mockEnsureLocalModelLoaded.mockResolvedValue("model not loaded");

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "model not loaded" });
  });

  it("POST reports ai_not_configured when settings lookup fails", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGetAISettings.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "ai_not_configured" });
  });

  it("POST generates insights, caches them, and returns uncached results", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);

    const response = await POST(
      new Request("http://localhost?force=1", { method: "POST" }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );

    // The cached data reaches the prompt in the current shape
    expect(mockBuildAnalyticsInsightsPrompt).toHaveBeenCalledWith(expect.objectContaining(analyticsData));
    expect(mockBuildAnalyticsInsightsPrompt.mock.calls[0][0].dailyTerritoryRevenue).toEqual([]);
    expect(mockCreateLanguageModel).toHaveBeenCalledWith(
      "openai",
      "gpt-4.1-mini",
      "sk-test",
      undefined,
    );
    expect(mockGenerateObjectWithRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "prompt",
        providerId: "openai",
        providerOptions: { openai: { reasoningEffort: "low" } },
      }),
    );
    expect(mockCacheSet).toHaveBeenCalledWith(
      "analytics-insights:app-1",
      {
        insights: { highlights: ["Growth"], opportunities: ["ASO"] },
        dataHash: "2:2026-03-02:5:12.5",
      },
      86400000,
    );
    expect(await response.json()).toEqual({
      insights: { highlights: ["Growth"], opportunities: ["ASO"] },
      dataHash: "2:2026-03-02:5:12.5",
      cached: false,
    });
  });

  it("POST passes Google gemini-3 thinking options", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGetAISettings.mockResolvedValue({
      provider: "google",
      modelId: "gemini-3-flash",
      apiKey: "gk-test",
    });

    await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockGenerateObjectWithRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "google",
        providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
      }),
    );
  });

  it("POST passes Google non-gemini-3 thinking options", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGetAISettings.mockResolvedValue({
      provider: "google",
      modelId: "gemini-2.5-pro",
      apiKey: "gk-test",
    });

    await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockGenerateObjectWithRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "google",
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      }),
    );
  });

  it("POST passes empty provider options for unknown providers", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGetAISettings.mockResolvedValue({
      provider: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      apiKey: "sk-ant-test",
    });

    await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockGenerateObjectWithRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "anthropic",
        providerOptions: {},
      }),
    );
  });

  it("POST falls back to stale cached insights when generation fails", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet
      .mockReturnValueOnce(analyticsData)
      .mockReturnValueOnce({
        insights: { highlights: ["Old"], opportunities: ["Old opp"] },
        dataHash: "old-hash",
      });
    mockGenerateObjectWithRepair.mockRejectedValue(new Error("timeout"));

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(await response.json()).toEqual({
      insights: { highlights: ["Old"], opportunities: ["Old opp"] },
      dataHash: "old-hash",
      cached: true,
      stale: true,
    });
  });

  it("POST maps auth and permission failures to ai_auth_error", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGenerateObjectWithRepair.mockRejectedValue(new Error("auth"));
    mockClassifyAIError.mockReturnValue("auth");

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "ai_auth_error" });
  });

  it("POST uses errorJson for non-auth AI failures", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/analytics/insights/route");
    mockCacheGet.mockReturnValueOnce(analyticsData).mockReturnValueOnce(null);
    mockGenerateObjectWithRepair.mockRejectedValue(new Error("boom"));

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error), 500, "AI request failed");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "AI request failed" });
  });
});
