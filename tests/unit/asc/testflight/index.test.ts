import { describe, it, expect, vi } from "vitest";

const mockCacheInvalidatePrefix = vi.fn();

vi.mock("@/lib/cache", () => ({
  cacheInvalidatePrefix: (...args: unknown[]) => mockCacheInvalidatePrefix(...args),
}));

// Mock all sub-modules to prevent import errors
vi.mock("@/lib/asc/testflight/builds", () => ({
  listBuilds: vi.fn(),
  fetchBuildMetrics: vi.fn(),
  updateBetaBuildLocalization: vi.fn(),
  addBuildToGroups: vi.fn(),
  removeBuildFromGroups: vi.fn(),
  submitForBetaReview: vi.fn(),
  expireBuild: vi.fn(),
  declareExportCompliance: vi.fn(),
  notifyTesters: vi.fn(),
}));

vi.mock("@/lib/asc/testflight/groups", () => ({
  listGroups: vi.fn(),
  getGroupDetail: vi.fn(),
  fetchTesterMetrics: vi.fn(),
  createGroup: vi.fn(),
  deleteGroup: vi.fn(),
}));

vi.mock("@/lib/asc/testflight/testers", () => ({
  listBuildIndividualTesters: vi.fn(),
  listAppBetaTesters: vi.fn(),
  addIndividualTestersToBuild: vi.fn(),
  removeIndividualTestersFromBuild: vi.fn(),
  addTestersToGroup: vi.fn(),
  removeTestersFromGroup: vi.fn(),
  createBetaTester: vi.fn(),
  sendBetaTesterInvitations: vi.fn(),
}));

vi.mock("@/lib/asc/testflight/info", () => ({
  getBetaAppInfo: vi.fn(),
  createBetaAppLocalization: vi.fn(),
  deleteBetaAppLocalization: vi.fn(),
  updateBetaAppLocalization: vi.fn(),
  updateBetaAppReviewDetail: vi.fn(),
  updateBetaLicenseAgreement: vi.fn(),
}));

vi.mock("@/lib/asc/testflight/feedback", () => ({
  listFeedback: vi.fn(),
  getFeedbackCrashLog: vi.fn(),
  deleteFeedbackItem: vi.fn(),
}));

vi.mock("@/lib/asc/testflight/pre-release-versions", () => ({
  listPreReleaseVersions: vi.fn(),
}));

import { invalidateTestFlightCache } from "@/lib/asc/testflight/index";

describe("invalidateTestFlightCache", () => {
  it("invalidates all TestFlight caches for the given app", () => {
    mockCacheInvalidatePrefix.mockReset();

    invalidateTestFlightCache("app-1");

    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("tf-builds:app-1");
    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("tf-groups:app-1");
    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("tf-info:app-1");
    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("tf-feedback:app-1");
    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("tf-pre-release-versions:app-1");
    expect(mockCacheInvalidatePrefix).toHaveBeenCalledTimes(5);
  });
});
