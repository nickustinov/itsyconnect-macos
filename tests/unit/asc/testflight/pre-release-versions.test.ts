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

import { listPreReleaseVersions } from "@/lib/asc/testflight/pre-release-versions";
import { BUILDS_TTL } from "@/lib/asc/testflight/types";

function mockApiResponse() {
  return {
    data: [
      {
        id: "prv-1",
        type: "preReleaseVersions",
        attributes: { version: "2.0.0", platform: "MAC_OS" },
      },
      {
        id: "prv-2",
        type: "preReleaseVersions",
        attributes: { version: "1.3.0", platform: "MAC_OS" },
      },
      {
        id: "prv-3",
        type: "preReleaseVersions",
        attributes: { version: "1.0.0", platform: "IOS" },
      },
    ],
  };
}

describe("listPreReleaseVersions", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
  });

  it("returns cached data when available", async () => {
    const cached = [
      { id: "prv-1", version: "2.0.0", platform: "MAC_OS" },
    ];
    mockCacheGet.mockReturnValue(cached);

    const result = await listPreReleaseVersions("app-1");

    expect(result).toBe(cached);
    expect(mockCacheGet).toHaveBeenCalledWith("tf-pre-release-versions:app-1");
    expect(mockAscFetch).not.toHaveBeenCalled();
  });

  it("fetches from API when cache is empty", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue(mockApiResponse());

    const result = await listPreReleaseVersions("app-1");

    expect(result).toEqual([
      { id: "prv-1", version: "2.0.0", platform: "MAC_OS" },
      { id: "prv-2", version: "1.3.0", platform: "MAC_OS" },
      { id: "prv-3", version: "1.0.0", platform: "IOS" },
    ]);

    expect(mockAscFetch).toHaveBeenCalledTimes(1);
    const url = mockAscFetch.mock.calls[0][0] as string;
    expect(url).toContain("/v1/preReleaseVersions");
    expect(url).toContain("filter%5Bapp%5D=app-1");
    expect(url).toContain("fields%5BpreReleaseVersions%5D=version%2Cplatform");
  });

  it("caches fetched data with BUILDS_TTL", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue(mockApiResponse());

    await listPreReleaseVersions("app-1");

    expect(mockCacheSet).toHaveBeenCalledWith(
      "tf-pre-release-versions:app-1",
      expect.any(Array),
      BUILDS_TTL,
    );
  });

  it("bypasses cache when forceRefresh is true", async () => {
    mockAscFetch.mockResolvedValue(mockApiResponse());

    await listPreReleaseVersions("app-1", true);

    expect(mockCacheGet).not.toHaveBeenCalled();
    expect(mockAscFetch).toHaveBeenCalledTimes(1);
  });

  it("handles single-object response", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: {
        id: "prv-1",
        type: "preReleaseVersions",
        attributes: { version: "1.0.0", platform: "IOS" },
      },
    });

    const result = await listPreReleaseVersions("app-1");

    expect(result).toEqual([
      { id: "prv-1", version: "1.0.0", platform: "IOS" },
    ]);
  });
});
