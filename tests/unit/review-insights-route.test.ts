import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateLanguageModel = vi.fn();
const mockClassifyAIError = vi.fn();
const mockGetAISettings = vi.fn();
const mockEnsureLocalModelLoaded = vi.fn();
const mockIsLocalOpenAIProvider = vi.fn();
const mockBuildInsightsPrompt = vi.fn();
const mockBuildIncrementalInsightsPrompt = vi.fn();
const mockGenerateObjectWithRepair = vi.fn();
const mockListCustomerReviews = vi.fn();
const mockHasCredentials = vi.fn();
const mockIsDemoMode = vi.fn();
const mockGetDemoReviews = vi.fn();
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
  buildInsightsPrompt: (...args: unknown[]) => mockBuildInsightsPrompt(...args),
  buildIncrementalInsightsPrompt: (...args: unknown[]) => mockBuildIncrementalInsightsPrompt(...args),
}));

vi.mock("@/lib/ai/structured-output", () => ({
  generateObjectWithRepair: (...args: unknown[]) => mockGenerateObjectWithRepair(...args),
}));

vi.mock("@/lib/asc/reviews", () => ({
  listCustomerReviews: (...args: unknown[]) => mockListCustomerReviews(...args),
}));

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: () => mockHasCredentials(),
}));

vi.mock("@/lib/demo", () => ({
  isDemoMode: () => mockIsDemoMode(),
  getDemoReviews: (...args: unknown[]) => mockGetDemoReviews(...args),
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

const rawReviews = [
  { attributes: { rating: 5, title: "Great", body: "Loved it" } },
  { attributes: { rating: 2, title: "Buggy", body: "Crashes often" } },
];

describe("review insights route", () => {
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
    mockBuildInsightsPrompt.mockReset();
    mockBuildInsightsPrompt.mockReturnValue("full-prompt");
    mockBuildIncrementalInsightsPrompt.mockReset();
    mockBuildIncrementalInsightsPrompt.mockReturnValue("incremental-prompt");
    mockGenerateObjectWithRepair.mockReset();
    mockGenerateObjectWithRepair.mockResolvedValue({
      object: {
        strengths: ["Good UX"],
        weaknesses: ["Crash reports"],
        potential: ["Feature discoverability"],
      },
    });
    mockListCustomerReviews.mockReset();
    mockListCustomerReviews.mockResolvedValue(rawReviews);
    mockHasCredentials.mockReset();
    mockHasCredentials.mockReturnValue(true);
    mockIsDemoMode.mockReset();
    mockIsDemoMode.mockReturnValue(false);
    mockGetDemoReviews.mockReset();
    mockGetDemoReviews.mockReturnValue(rawReviews);
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockErrorJson.mockReset();
    mockErrorJson.mockImplementation(
      (_err, status = 500, fallback = "mapped") =>
        new Response(JSON.stringify({ error: fallback }), { status: status as number }),
    );
    vi.resetModules();
  });

  it("GET returns an empty cache response when nothing is cached", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockCacheGet.mockReturnValueOnce(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(await response.json()).toEqual({ insights: null, cached: false });
  });

  it("GET returns cached insights and refreshes current count from reviews", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockCacheGet.mockReturnValueOnce({
      insights: { strengths: ["Good UX"], weaknesses: ["Crashes"], potential: ["ASO"] },
      reviewCount: 1,
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockListCustomerReviews).toHaveBeenCalledWith("app-1", "-createdDate");
    expect(await response.json()).toEqual({
      insights: { strengths: ["Good UX"], weaknesses: ["Crashes"], potential: ["ASO"] },
      reviewCount: 1,
      currentReviewCount: 2,
      cached: true,
    });
  });

  it("GET uses demo reviews for the cached current count and tolerates count refresh failures", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockCacheGet.mockReturnValue({
      insights: { strengths: ["Good UX"], weaknesses: ["Crashes"], potential: ["ASO"] },
      reviewCount: 1,
    });

    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoReviews.mockReturnValue([{ attributes: {} }, { attributes: {} }, { attributes: {} }]);
    let response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({
      insights: { strengths: ["Good UX"], weaknesses: ["Crashes"], potential: ["ASO"] },
      reviewCount: 1,
      currentReviewCount: 3,
      cached: true,
    });

    mockIsDemoMode.mockReturnValue(false);
    mockListCustomerReviews.mockRejectedValueOnce(new Error("count failed"));
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({
      insights: { strengths: ["Good UX"], weaknesses: ["Crashes"], potential: ["ASO"] },
      reviewCount: 1,
      currentReviewCount: 1,
      cached: true,
    });
  });

  it("POST rejects requests without ASC credentials", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockHasCredentials.mockReturnValue(false);

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No ASC credentials" });
  });

  it("POST rejects when there are no reviews to analyse", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockListCustomerReviews.mockResolvedValue([]);

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No reviews to analyse" });
  });

  it("POST uses demo reviews when demo mode is enabled", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoReviews.mockReturnValue(rawReviews);

    const response = await POST(
      new Request("http://localhost?force=1", { method: "POST" }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );

    expect(mockListCustomerReviews).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      insights: {
        strengths: ["Good UX"],
        weaknesses: ["Crash reports"],
        potential: ["Feature discoverability"],
      },
      reviewCount: 2,
      currentReviewCount: 2,
      cached: false,
    });
  });

  it("POST returns cached insights when review counts match", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockCacheGet.mockReturnValueOnce({
      insights: { strengths: ["Good UX"], weaknesses: ["Crashes"], potential: ["ASO"] },
      reviewCount: 2,
    });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(await response.json()).toEqual({
      insights: { strengths: ["Good UX"], weaknesses: ["Crashes"], potential: ["ASO"] },
      reviewCount: 2,
      currentReviewCount: 2,
      cached: true,
    });
  });

  it("POST uses the incremental prompt when only new reviews need processing", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockCacheGet.mockReturnValueOnce({
      insights: { strengths: ["Good UX"], weaknesses: ["Crashes"], potential: ["ASO"] },
      reviewCount: 1,
    });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockBuildIncrementalInsightsPrompt).toHaveBeenCalledWith(
      [{ rating: 5, title: "Great", body: "Loved it" }],
      { strengths: ["Good UX"], weaknesses: ["Crashes"], potential: ["ASO"] },
      2,
    );
    expect(await response.json()).toEqual({
      insights: {
        strengths: ["Good UX"],
        weaknesses: ["Crash reports"],
        potential: ["Feature discoverability"],
      },
      reviewCount: 2,
      currentReviewCount: 2,
      cached: false,
    });
  });

  it("POST returns errorJson when fetching reviews throws", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockListCustomerReviews.mockRejectedValue(new Error("ASC error"));

    await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error));
  });

  it("POST uses Google thinkingLevel low for gemini-3 models", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockGetAISettings.mockResolvedValue({
      provider: "google",
      modelId: "gemini-3-flash",
      apiKey: "gk-test",
    });

    const response = await POST(
      new Request("http://localhost?force=1", { method: "POST" }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );

    expect(mockGenerateObjectWithRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "google",
        providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("POST uses Google thinkingBudget 0 for non-gemini-3 models", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockGetAISettings.mockResolvedValue({
      provider: "google",
      modelId: "gemini-2.5-flash",
      apiKey: "gk-test",
    });

    const response = await POST(
      new Request("http://localhost?force=1", { method: "POST" }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );

    expect(mockGenerateObjectWithRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "google",
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("POST uses empty providerOptions for non-openai non-google providers", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockGetAISettings.mockResolvedValue({
      provider: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      apiKey: "sk-ant-test",
    });

    const response = await POST(
      new Request("http://localhost?force=1", { method: "POST" }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );

    expect(mockGenerateObjectWithRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "anthropic",
        providerOptions: {},
      }),
    );
    expect(response.status).toBe(200);
  });

  it("POST reports ai_not_configured when settings are missing", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockGetAISettings.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "ai_not_configured" });
  });

  it("POST maps local model load errors to 422", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/insights/route");
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

  it("POST returns stale cached insights on generation failure", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockCacheGet.mockReturnValueOnce({
      insights: { strengths: ["Old"], weaknesses: ["Old"], potential: ["Old"] },
      reviewCount: 1,
    });
    mockGenerateObjectWithRepair.mockRejectedValue(new Error("timeout"));

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(await response.json()).toEqual({
      insights: { strengths: ["Old"], weaknesses: ["Old"], potential: ["Old"] },
      reviewCount: 1,
      currentReviewCount: 2,
      cached: true,
      stale: true,
    });
  });

  it("POST maps auth errors to ai_auth_error", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockGenerateObjectWithRepair.mockRejectedValue(new Error("auth"));
    mockClassifyAIError.mockReturnValue("permission");

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "ai_auth_error" });
  });

  it("POST uses errorJson for non-auth AI failures", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/insights/route");
    mockGenerateObjectWithRepair.mockRejectedValue(new Error("boom"));

    const response = await POST(
      new Request("http://localhost?force=1", { method: "POST" }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );

    expect(mockBuildInsightsPrompt).toHaveBeenCalledWith([
      { rating: 5, title: "Great", body: "Loved it" },
      { rating: 2, title: "Buggy", body: "Crashes often" },
    ]);
    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error), 500, "AI request failed");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "AI request failed" });
  });
});
