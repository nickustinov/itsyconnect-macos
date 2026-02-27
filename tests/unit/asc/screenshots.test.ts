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

import { listScreenshotSets } from "@/lib/asc/screenshots";

describe("listScreenshotSets", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
  });

  it("returns cached data when available", async () => {
    const cached = [{ id: "set-1", attributes: {}, screenshots: [] }];
    mockCacheGet.mockReturnValue(cached);

    const result = await listScreenshotSets("loc-1");
    expect(result).toBe(cached);
    expect(mockAscFetch).not.toHaveBeenCalled();
  });

  it("fetches from API and resolves included screenshots", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "set-1",
          type: "appScreenshotSets",
          attributes: { screenshotDisplayType: "APP_IPHONE_67" },
          relationships: {
            appScreenshots: {
              data: [
                { id: "ss-1", type: "appScreenshots" },
                { id: "ss-2", type: "appScreenshots" },
              ],
            },
          },
        },
      ],
      included: [
        {
          id: "ss-1",
          type: "appScreenshots",
          attributes: {
            fileSize: 1024,
            fileName: "screen1.png",
            sourceFileChecksum: "abc",
            assetDeliveryState: { state: "COMPLETE" },
            assetToken: "token-1",
          },
        },
        {
          id: "ss-2",
          type: "appScreenshots",
          attributes: {
            fileSize: 2048,
            fileName: "screen2.png",
            sourceFileChecksum: "def",
            assetDeliveryState: { state: "COMPLETE" },
            assetToken: "token-2",
          },
        },
      ],
    });

    const result = await listScreenshotSets("loc-1");
    expect(result).toHaveLength(1);
    expect(result[0].screenshots).toHaveLength(2);
    expect(result[0].screenshots[0].id).toBe("ss-1");
    expect(result[0].screenshots[1].attributes.fileName).toBe("screen2.png");
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it("bypasses cache when forceRefresh is true", async () => {
    mockCacheGet.mockReturnValue([]);
    mockAscFetch.mockResolvedValue({ data: [] });

    await listScreenshotSets("loc-1", true);
    expect(mockCacheGet).not.toHaveBeenCalled();
  });

  it("handles empty response", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({ data: [] });

    const result = await listScreenshotSets("loc-1");
    expect(result).toEqual([]);
  });

  it("handles missing included array", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "set-1",
          type: "appScreenshotSets",
          attributes: { screenshotDisplayType: "APP_IPHONE_67" },
          relationships: {
            appScreenshots: {
              data: [{ id: "ss-1", type: "appScreenshots" }],
            },
          },
        },
      ],
    });

    const result = await listScreenshotSets("loc-1");
    expect(result[0].screenshots).toEqual([]);
  });

  it("handles missing appScreenshots relationship data", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "set-1",
          type: "appScreenshotSets",
          attributes: { screenshotDisplayType: "APP_IPHONE_67" },
          relationships: {},
        },
      ],
      included: [],
    });

    const result = await listScreenshotSets("loc-1");
    expect(result[0].screenshots).toEqual([]);
  });

  it("skips non-appScreenshots in included array", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "set-1",
          type: "appScreenshotSets",
          attributes: { screenshotDisplayType: "APP_IPHONE_67" },
          relationships: {
            appScreenshots: { data: [] },
          },
        },
      ],
      included: [
        { id: "other-1", type: "otherType", attributes: {} },
      ],
    });

    const result = await listScreenshotSets("loc-1");
    expect(result[0].screenshots).toEqual([]);
  });

  it("filters out screenshots not found in included", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "set-1",
          type: "appScreenshotSets",
          attributes: { screenshotDisplayType: "APP_IPHONE_67" },
          relationships: {
            appScreenshots: {
              data: [
                { id: "ss-1", type: "appScreenshots" },
                { id: "ss-missing", type: "appScreenshots" },
              ],
            },
          },
        },
      ],
      included: [
        {
          id: "ss-1",
          type: "appScreenshots",
          attributes: {
            fileSize: 1024,
            fileName: "screen1.png",
            sourceFileChecksum: null,
            assetDeliveryState: null,
            assetToken: null,
          },
        },
      ],
    });

    const result = await listScreenshotSets("loc-1");
    expect(result[0].screenshots).toHaveLength(1);
  });
});
