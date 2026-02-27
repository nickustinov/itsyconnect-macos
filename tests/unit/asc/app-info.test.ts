import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAscFetch = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  ascFetch: (...args: unknown[]) => mockAscFetch(...args),
}));

vi.mock("@/lib/cache", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
}));

import { listAppInfos, listAppInfoLocalizations } from "@/lib/asc/app-info";

describe("listAppInfos", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
  });

  it("returns cached data when available", async () => {
    const cached = [{ id: "info-1", attributes: { state: "READY_FOR_DISTRIBUTION" } }];
    mockCacheGet.mockReturnValue(cached);

    const result = await listAppInfos("app-1");
    expect(result).toBe(cached);
    expect(mockAscFetch).not.toHaveBeenCalled();
  });

  it("fetches from API on cache miss and resolves categories", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "info-1",
          type: "appInfos",
          attributes: {
            appStoreState: "READY_FOR_SALE",
            appStoreAgeRating: "FOUR_PLUS",
            brazilAgeRating: null,
            brazilAgeRatingV2: null,
            kidsAgeBand: null,
            state: "READY_FOR_DISTRIBUTION",
          },
          relationships: {
            primaryCategory: { data: { id: "cat-1", type: "appCategories" } },
            secondaryCategory: { data: null },
          },
        },
      ],
      included: [
        {
          id: "cat-1",
          type: "appCategories",
          attributes: { platforms: ["IOS"], parent: null },
        },
      ],
    });

    const result = await listAppInfos("app-1");
    expect(result).toHaveLength(1);
    expect(result[0].primaryCategory).toEqual({
      id: "cat-1",
      attributes: { platforms: ["IOS"], parent: null },
    });
    expect(result[0].secondaryCategory).toBeNull();
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it("bypasses cache when forceRefresh is true", async () => {
    mockCacheGet.mockReturnValue([{ id: "cached" }]);
    mockAscFetch.mockResolvedValue({ data: [] });

    await listAppInfos("app-1", true);
    expect(mockCacheGet).not.toHaveBeenCalled();
    expect(mockAscFetch).toHaveBeenCalled();
  });

  it("handles empty response", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({ data: [] });

    const result = await listAppInfos("app-1");
    expect(result).toEqual([]);
  });

  it("skips non-category items in included array", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "info-1",
          type: "appInfos",
          attributes: {
            appStoreState: "READY_FOR_SALE",
            appStoreAgeRating: null,
            brazilAgeRating: null,
            brazilAgeRatingV2: null,
            kidsAgeBand: null,
            state: "READY_FOR_DISTRIBUTION",
          },
        },
      ],
      included: [
        { id: "other-1", type: "notACategory", attributes: {} },
      ],
    });

    const result = await listAppInfos("app-1");
    expect(result[0].primaryCategory).toBeNull();
  });

  it("handles missing included array", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "info-1",
          type: "appInfos",
          attributes: {
            appStoreState: "READY_FOR_SALE",
            appStoreAgeRating: null,
            brazilAgeRating: null,
            brazilAgeRatingV2: null,
            kidsAgeBand: null,
            state: "PREPARE_FOR_SUBMISSION",
          },
        },
      ],
    });

    const result = await listAppInfos("app-1");
    expect(result[0].primaryCategory).toBeNull();
    expect(result[0].secondaryCategory).toBeNull();
  });
});

describe("listAppInfoLocalizations", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
  });

  it("returns cached data when available", async () => {
    const cached = [{ id: "loc-1", attributes: { locale: "en-US" } }];
    mockCacheGet.mockReturnValue(cached);

    const result = await listAppInfoLocalizations("info-1");
    expect(result).toBe(cached);
  });

  it("fetches from API on cache miss", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "loc-1",
          type: "appInfoLocalizations",
          attributes: {
            locale: "en-US",
            name: "My App",
            subtitle: "Subtitle",
            privacyPolicyText: null,
            privacyPolicyUrl: "https://example.com/privacy",
            privacyChoicesUrl: null,
          },
        },
      ],
    });

    const result = await listAppInfoLocalizations("info-1");
    expect(result).toHaveLength(1);
    expect(result[0].attributes.locale).toBe("en-US");
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it("bypasses cache when forceRefresh is true", async () => {
    mockCacheGet.mockReturnValue([]);
    mockAscFetch.mockResolvedValue({ data: [] });

    await listAppInfoLocalizations("info-1", true);
    expect(mockCacheGet).not.toHaveBeenCalled();
  });
});
