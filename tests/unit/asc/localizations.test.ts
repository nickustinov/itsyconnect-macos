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

import { listLocalizations } from "@/lib/asc/localizations";

describe("listLocalizations", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
  });

  it("returns cached data when available", async () => {
    const cached = [{ id: "loc-1", attributes: { locale: "en-US" } }];
    mockCacheGet.mockReturnValue(cached);

    const result = await listLocalizations("ver-1");
    expect(result).toBe(cached);
    expect(mockAscFetch).not.toHaveBeenCalled();
  });

  it("fetches from API on cache miss", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "loc-1",
          type: "appStoreVersionLocalizations",
          attributes: {
            locale: "en-US",
            description: "A cool app",
            keywords: "cool,app",
            marketingUrl: null,
            promotionalText: null,
            supportUrl: "https://example.com",
            whatsNew: "Bug fixes",
          },
        },
        {
          id: "loc-2",
          type: "appStoreVersionLocalizations",
          attributes: {
            locale: "de-DE",
            description: "Eine coole App",
            keywords: "cool,app",
            marketingUrl: null,
            promotionalText: null,
            supportUrl: "https://example.com",
            whatsNew: "Fehlerbehebungen",
          },
        },
      ],
    });

    const result = await listLocalizations("ver-1");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("loc-1");
    expect(result[1].attributes.locale).toBe("de-DE");
    expect(mockCacheSet).toHaveBeenCalledWith(
      "localizations:ver-1",
      result,
      15 * 60 * 1000,
    );
  });

  it("bypasses cache when forceRefresh is true", async () => {
    mockCacheGet.mockReturnValue([]);
    mockAscFetch.mockResolvedValue({ data: [] });

    await listLocalizations("ver-1", true);
    expect(mockCacheGet).not.toHaveBeenCalled();
    expect(mockAscFetch).toHaveBeenCalled();
  });

  it("handles empty response", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({ data: [] });

    const result = await listLocalizations("ver-1");
    expect(result).toEqual([]);
  });
});
