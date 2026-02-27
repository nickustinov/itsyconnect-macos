import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAscFetch = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  ascFetch: (...args: unknown[]) => mockAscFetch(...args),
}));

vi.mock("@/lib/cache", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
}));

vi.stubGlobal("fetch", mockFetch);

import { listApps } from "@/lib/asc/apps";

describe("listApps", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockFetch.mockReset();
  });

  it("returns cached data when available", async () => {
    const cached = [
      { id: "1", attributes: { name: "App", bundleId: "com.x", sku: "x", primaryLocale: "en-US", iconUrl: "http://icon" } },
    ];
    mockCacheGet.mockReturnValue(cached);

    const result = await listApps();
    expect(result).toBe(cached);
    expect(mockAscFetch).not.toHaveBeenCalled();
  });

  it("treats cache as stale if iconUrl is undefined", async () => {
    mockCacheGet.mockReturnValue([
      { id: "1", attributes: { name: "App", bundleId: "com.x", sku: "x", primaryLocale: "en-US" } },
    ]);
    mockAscFetch.mockResolvedValue({ data: [] });
    mockFetch.mockResolvedValue({ ok: false });

    await listApps();
    expect(mockAscFetch).toHaveBeenCalled();
  });

  it("fetches from ASC API on cache miss", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        { id: "123", attributes: { name: "My App", bundleId: "com.test", sku: "SKU1", primaryLocale: "en-US" } },
      ],
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ trackId: 123, artworkUrl512: "http://icon/512.png" }],
      }),
    });

    const result = await listApps();
    expect(result).toEqual([
      {
        id: "123",
        attributes: {
          name: "My App",
          bundleId: "com.test",
          sku: "SKU1",
          primaryLocale: "en-US",
          iconUrl: "http://icon/512.png",
        },
      },
    ]);
    expect(mockCacheSet).toHaveBeenCalledWith("apps", result, 3_600_000);
  });

  it("bypasses cache when forceRefresh is true", async () => {
    mockCacheGet.mockReturnValue([{ id: "old" }]);
    mockAscFetch.mockResolvedValue({ data: [] });
    mockFetch.mockResolvedValue({ ok: false });

    await listApps(true);
    expect(mockCacheGet).not.toHaveBeenCalled();
    expect(mockAscFetch).toHaveBeenCalled();
  });

  it("sets iconUrl to null when iTunes lookup fails", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        { id: "1", attributes: { name: "App", bundleId: "com.x", sku: "x", primaryLocale: "en-US" } },
      ],
    });
    mockFetch.mockResolvedValue({ ok: false });

    const result = await listApps();
    expect(result[0].attributes.iconUrl).toBeNull();
  });

  it("handles empty app list", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({ data: [] });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

    const result = await listApps();
    expect(result).toEqual([]);
  });

  it("ignores iTunes results with no artwork URL", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        { id: "1", attributes: { name: "App", bundleId: "com.x", sku: "x", primaryLocale: "en-US" } },
      ],
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ trackId: 1 }], // no artworkUrl512 or artworkUrl100
      }),
    });

    const result = await listApps();
    expect(result[0].attributes.iconUrl).toBeNull();
  });

  it("handles iTunes fetch throwing an error", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        { id: "1", attributes: { name: "App", bundleId: "com.x", sku: "x", primaryLocale: "en-US" } },
      ],
    });
    mockFetch.mockRejectedValue(new Error("network error"));

    const result = await listApps();
    expect(result[0].attributes.iconUrl).toBeNull();
  });

  it("uses artworkUrl100 as fallback when artworkUrl512 missing", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        { id: "1", attributes: { name: "App", bundleId: "com.x", sku: "x", primaryLocale: "en-US" } },
      ],
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ trackId: 1, artworkUrl100: "http://icon/100.png" }],
      }),
    });

    const result = await listApps();
    expect(result[0].attributes.iconUrl).toBe("http://icon/100.png");
  });
});
