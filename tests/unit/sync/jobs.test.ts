import { describe, it, expect, vi, beforeEach } from "vitest";

const mockHasCredentials = vi.fn();
const mockListApps = vi.fn();
const mockBuildAnalyticsData = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: (...args: unknown[]) => mockHasCredentials(...args),
}));

vi.mock("@/lib/asc/apps", () => ({
  listApps: (...args: unknown[]) => mockListApps(...args),
}));

vi.mock("@/lib/asc/analytics", () => ({
  buildAnalyticsData: (...args: unknown[]) => mockBuildAnalyticsData(...args),
}));

import { syncApps, syncAnalytics } from "@/lib/sync/jobs";

describe("syncApps", () => {
  beforeEach(() => {
    mockHasCredentials.mockReset();
    mockListApps.mockReset();
    mockBuildAnalyticsData.mockReset();
  });

  it("calls listApps with forceRefresh when credentials exist", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockListApps.mockResolvedValue([]);

    await syncApps();
    expect(mockListApps).toHaveBeenCalledWith(true);
  });

  it("skips when no credentials exist", async () => {
    mockHasCredentials.mockReturnValue(false);

    await syncApps();
    expect(mockListApps).not.toHaveBeenCalled();
  });

  it("propagates errors from listApps", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockListApps.mockRejectedValue(new Error("API error"));

    await expect(syncApps()).rejects.toThrow("API error");
  });
});

describe("syncAnalytics", () => {
  beforeEach(() => {
    mockHasCredentials.mockReset();
    mockListApps.mockReset();
    mockBuildAnalyticsData.mockReset();
  });

  it("fetches analytics for each app sequentially", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockListApps.mockResolvedValue([{ id: "123" }, { id: "456" }]);
    mockBuildAnalyticsData.mockResolvedValue({});

    await syncAnalytics();
    expect(mockListApps).toHaveBeenCalled();
    expect(mockBuildAnalyticsData).toHaveBeenCalledWith("123");
    expect(mockBuildAnalyticsData).toHaveBeenCalledWith("456");
  });

  it("skips when no credentials exist", async () => {
    mockHasCredentials.mockReturnValue(false);

    await syncAnalytics();
    expect(mockListApps).not.toHaveBeenCalled();
    expect(mockBuildAnalyticsData).not.toHaveBeenCalled();
  });
});
