import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListCustomerReviews = vi.fn();
const mockCreateReviewResponse = vi.fn();
const mockDeleteReviewResponse = vi.fn();
const mockInvalidateReviewsCache = vi.fn();
const mockHasCredentials = vi.fn();
const mockCacheGetMeta = vi.fn();
const mockErrorJson = vi.fn();
const mockIsDemoMode = vi.fn();
const mockGetDemoReviews = vi.fn();

vi.mock("@/lib/asc/reviews", () => ({
  listCustomerReviews: (...args: unknown[]) => mockListCustomerReviews(...args),
  createReviewResponse: (...args: unknown[]) => mockCreateReviewResponse(...args),
  deleteReviewResponse: (...args: unknown[]) => mockDeleteReviewResponse(...args),
  invalidateReviewsCache: (...args: unknown[]) => mockInvalidateReviewsCache(...args),
}));

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: () => mockHasCredentials(),
}));

vi.mock("@/lib/cache", () => ({
  cacheGetMeta: (...args: unknown[]) => mockCacheGetMeta(...args),
}));

vi.mock("@/lib/demo", () => ({
  isDemoMode: () => mockIsDemoMode(),
  getDemoReviews: (...args: unknown[]) => mockGetDemoReviews(...args),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    errorJson: (...args: unknown[]) => mockErrorJson(...args),
  };
});

function makeParams(appId = "app-1") {
  return { params: Promise.resolve({ appId }) };
}

describe("reviews route", () => {
  beforeEach(() => {
    mockListCustomerReviews.mockReset();
    mockCreateReviewResponse.mockReset();
    mockDeleteReviewResponse.mockReset();
    mockInvalidateReviewsCache.mockReset();
    mockHasCredentials.mockReturnValue(true);
    mockCacheGetMeta.mockReturnValue(null);
    mockErrorJson.mockImplementation(
      () => new Response(JSON.stringify({ error: "mapped" }), { status: 502 }),
    );
    mockIsDemoMode.mockReturnValue(false);
    mockGetDemoReviews.mockReturnValue([{ id: "demo-review" }]);
  });

  it("GET returns demo reviews", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/reviews/route");

    mockIsDemoMode.mockReturnValue(true);

    const response = await GET(new Request("http://localhost"), makeParams("app-7"));
    const data = await response.json();

    expect(data).toEqual({ reviews: [{ id: "demo-review" }], meta: null });
  });

  it("GET forwards sort and refresh parameters", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/reviews/route");

    mockListCustomerReviews.mockResolvedValue([{ id: "r1" }]);
    mockCacheGetMeta.mockReturnValue({ fetchedAt: 1 });

    const response = await GET(
      new Request("http://localhost/api/reviews?sort=oldest&refresh=1"),
      makeParams("app-1"),
    );
    const data = await response.json();

    expect(mockListCustomerReviews).toHaveBeenCalledWith(
      "app-1",
      "createdDate",
      true,
    );
    expect(data).toEqual({ reviews: [{ id: "r1" }], meta: { fetchedAt: 1 } });
  });

  it("POST rejects invalid JSON", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      makeParams(),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid JSON body");
  });

  it("POST creates a reply", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/route");

    mockCreateReviewResponse.mockResolvedValue({ id: "resp-1" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          reviewId: "rev-1",
          responseBody: "Thanks for the feedback",
        }),
      }),
      makeParams("app-42"),
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true, responseId: "resp-1" });
    expect(mockInvalidateReviewsCache).toHaveBeenCalledWith("app-42");
  });

  it("POST updates a reply by deleting and recreating it", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/route");

    mockCreateReviewResponse.mockResolvedValue({ id: "resp-new" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          reviewId: "rev-1",
          responseId: "resp-old",
          responseBody: "Updated reply",
        }),
      }),
      makeParams(),
    );
    const data = await response.json();

    expect(mockDeleteReviewResponse).toHaveBeenCalledWith("resp-old");
    expect(mockCreateReviewResponse).toHaveBeenCalledWith("rev-1", "Updated reply");
    expect(data).toEqual({ ok: true, responseId: "resp-new" });
  });

  it("GET returns empty reviews when no credentials", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/reviews/route");

    mockHasCredentials.mockReturnValue(false);

    const response = await GET(new Request("http://localhost"), makeParams());
    const data = await response.json();

    expect(data).toEqual({ reviews: [], meta: null });
  });

  it("GET returns errorJson when listCustomerReviews throws", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/reviews/route");

    mockListCustomerReviews.mockRejectedValue(new Error("fetch failed"));

    await GET(new Request("http://localhost"), makeParams());

    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error));
  });

  it("POST returns ok in demo mode", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/route");

    mockIsDemoMode.mockReturnValue(true);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", reviewId: "r1", responseBody: "Thanks" }),
      }),
      makeParams(),
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true });
  });

  it("POST returns error when no credentials", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/route");

    mockHasCredentials.mockReturnValue(false);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", reviewId: "r1", responseBody: "Thanks" }),
      }),
      makeParams(),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("No ASC credentials");
  });

  it("POST returns validation error for invalid payload", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", reviewId: "" }),
      }),
      makeParams(),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
    expect(data.details).toBeDefined();
  });

  it("POST returns errorJson when action throws", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/route");

    mockCreateReviewResponse.mockRejectedValue(new Error("ASC error"));

    await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          reviewId: "rev-1",
          responseBody: "Thanks",
        }),
      }),
      makeParams(),
    );

    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error));
  });

  it("POST deletes a reply", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/reviews/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          responseId: "resp-1",
        }),
      }),
      makeParams(),
    );
    const data = await response.json();

    expect(mockDeleteReviewResponse).toHaveBeenCalledWith("resp-1");
    expect(data).toEqual({ ok: true });
  });
});
