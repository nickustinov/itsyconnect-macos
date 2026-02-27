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

import { listVersions } from "@/lib/asc/versions";

describe("listVersions", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
  });

  it("returns cached data when available", async () => {
    const cached = [{ id: "v-1", attributes: {}, build: null, reviewDetail: null }];
    mockCacheGet.mockReturnValue(cached);

    const result = await listVersions("app-1");
    expect(result).toBe(cached);
    expect(mockAscFetch).not.toHaveBeenCalled();
  });

  it("fetches from API and resolves included builds and review details", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "v-1",
          type: "appStoreVersions",
          attributes: {
            versionString: "1.0.0",
            appVersionState: "PREPARE_FOR_SUBMISSION",
            appStoreState: "PREPARE_FOR_SUBMISSION",
            platform: "IOS",
            copyright: null,
            releaseType: null,
            earliestReleaseDate: null,
            downloadable: false,
            createdDate: "2026-01-01T00:00:00Z",
            reviewType: null,
          },
          relationships: {
            build: { data: { id: "build-1", type: "builds" } },
            appStoreReviewDetail: { data: { id: "rd-1", type: "appStoreReviewDetails" } },
          },
        },
      ],
      included: [
        {
          id: "build-1",
          type: "builds",
          attributes: {
            version: "42",
            uploadedDate: "2026-01-01T00:00:00Z",
            processingState: "VALID",
            minOsVersion: "17.0",
            iconAssetToken: null,
          },
        },
        {
          id: "rd-1",
          type: "appStoreReviewDetails",
          attributes: {
            contactEmail: "test@example.com",
            contactFirstName: "Test",
            contactLastName: "User",
            contactPhone: "+1234567890",
            demoAccountName: null,
            demoAccountPassword: null,
            demoAccountRequired: false,
            notes: null,
          },
        },
      ],
    });

    const result = await listVersions("app-1");
    expect(result).toHaveLength(1);
    expect(result[0].build).not.toBeNull();
    expect(result[0].build!.attributes.version).toBe("42");
    expect(result[0].reviewDetail).not.toBeNull();
    expect(result[0].reviewDetail!.attributes.contactEmail).toBe("test@example.com");
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it("sets build and reviewDetail to null when not in included", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "v-1",
          type: "appStoreVersions",
          attributes: {
            versionString: "1.0.0",
            appVersionState: "PREPARE_FOR_SUBMISSION",
            appStoreState: "PREPARE_FOR_SUBMISSION",
            platform: "IOS",
            copyright: null,
            releaseType: null,
            earliestReleaseDate: null,
            downloadable: false,
            createdDate: "2026-01-01T00:00:00Z",
            reviewType: null,
          },
          relationships: {
            build: { data: null },
          },
        },
      ],
    });

    const result = await listVersions("app-1");
    expect(result[0].build).toBeNull();
    expect(result[0].reviewDetail).toBeNull();
  });

  it("skips non-build/non-review items in included array", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "v-1",
          type: "appStoreVersions",
          attributes: {
            versionString: "1.0.0",
            appVersionState: "PREPARE_FOR_SUBMISSION",
            appStoreState: "PREPARE_FOR_SUBMISSION",
            platform: "IOS",
            copyright: null,
            releaseType: null,
            earliestReleaseDate: null,
            downloadable: false,
            createdDate: "2026-01-01T00:00:00Z",
            reviewType: null,
          },
        },
      ],
      included: [
        { id: "x", type: "unknownType", attributes: {} },
      ],
    });

    const result = await listVersions("app-1");
    expect(result[0].build).toBeNull();
    expect(result[0].reviewDetail).toBeNull();
  });

  it("bypasses cache when forceRefresh is true", async () => {
    mockCacheGet.mockReturnValue([]);
    mockAscFetch.mockResolvedValue({ data: [] });

    await listVersions("app-1", true);
    expect(mockCacheGet).not.toHaveBeenCalled();
    expect(mockAscFetch).toHaveBeenCalled();
  });

  it("handles empty response", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({ data: [] });

    const result = await listVersions("app-1");
    expect(result).toEqual([]);
  });
});
