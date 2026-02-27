import { describe, it, expect, vi, beforeEach } from "vitest";

const mockHasCredentials = vi.fn();
const mockListApps = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: (...args: unknown[]) => mockHasCredentials(...args),
}));

vi.mock("@/lib/asc/apps", () => ({
  listApps: (...args: unknown[]) => mockListApps(...args),
}));

import { syncApps } from "@/lib/sync/jobs";

describe("syncApps", () => {
  beforeEach(() => {
    mockHasCredentials.mockReset();
    mockListApps.mockReset();
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
