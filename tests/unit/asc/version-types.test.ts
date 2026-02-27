import { describe, it, expect } from "vitest";
import {
  getVersionPlatforms,
  getVersionsByPlatform,
  resolveVersion,
} from "@/lib/asc/version-types";
import type { AscVersion } from "@/lib/asc/version-types";

function makeVersion(
  id: string,
  platform: string,
  state: string,
): AscVersion {
  return {
    id,
    attributes: {
      versionString: "1.0.0",
      appVersionState: state,
      appStoreState: "READY_FOR_SALE",
      platform,
      copyright: null,
      releaseType: null,
      earliestReleaseDate: null,
      downloadable: true,
      createdDate: "2026-01-01T00:00:00Z",
      reviewType: null,
    },
    build: null,
    reviewDetail: null,
  };
}

describe("getVersionPlatforms", () => {
  it("returns unique platforms", () => {
    const versions = [
      makeVersion("1", "IOS", "READY_FOR_SALE"),
      makeVersion("2", "IOS", "PREPARE_FOR_SUBMISSION"),
      makeVersion("3", "MAC_OS", "READY_FOR_SALE"),
    ];
    const platforms = getVersionPlatforms(versions);
    expect(platforms).toHaveLength(2);
    expect(platforms).toContain("IOS");
    expect(platforms).toContain("MAC_OS");
  });

  it("returns empty array for no versions", () => {
    expect(getVersionPlatforms([])).toEqual([]);
  });
});

describe("getVersionsByPlatform", () => {
  it("filters versions by platform", () => {
    const versions = [
      makeVersion("1", "IOS", "READY_FOR_SALE"),
      makeVersion("2", "MAC_OS", "READY_FOR_SALE"),
      makeVersion("3", "IOS", "PREPARE_FOR_SUBMISSION"),
    ];
    const ios = getVersionsByPlatform(versions, "IOS");
    expect(ios).toHaveLength(2);
    expect(ios.every((v) => v.attributes.platform === "IOS")).toBe(true);
  });

  it("returns empty array when no versions match", () => {
    const versions = [makeVersion("1", "IOS", "READY_FOR_SALE")];
    expect(getVersionsByPlatform(versions, "MAC_OS")).toEqual([]);
  });
});

describe("resolveVersion", () => {
  it("returns version by ID when found", () => {
    const versions = [
      makeVersion("1", "IOS", "READY_FOR_SALE"),
      makeVersion("2", "IOS", "PREPARE_FOR_SUBMISSION"),
    ];
    expect(resolveVersion(versions, "1")).toBe(versions[0]);
  });

  it("falls back to editable version when ID not found", () => {
    const versions = [
      makeVersion("1", "IOS", "READY_FOR_SALE"),
      makeVersion("2", "IOS", "PREPARE_FOR_SUBMISSION"),
    ];
    expect(resolveVersion(versions, "nonexistent")).toBe(versions[1]);
  });

  it("falls back to editable version when versionId is null", () => {
    const versions = [
      makeVersion("1", "IOS", "READY_FOR_SALE"),
      makeVersion("2", "IOS", "REJECTED"),
    ];
    expect(resolveVersion(versions, null)).toBe(versions[1]);
  });

  it("recognizes all editable states", () => {
    for (const state of [
      "PREPARE_FOR_SUBMISSION",
      "REJECTED",
      "METADATA_REJECTED",
      "DEVELOPER_REJECTED",
    ]) {
      const versions = [
        makeVersion("1", "IOS", "READY_FOR_SALE"),
        makeVersion("2", "IOS", state),
      ];
      expect(resolveVersion(versions, null)).toBe(versions[1]);
    }
  });

  it("falls back to first version when none are editable", () => {
    const versions = [
      makeVersion("1", "IOS", "READY_FOR_SALE"),
      makeVersion("2", "IOS", "READY_FOR_SALE"),
    ];
    expect(resolveVersion(versions, null)).toBe(versions[0]);
  });

  it("returns undefined for empty array", () => {
    expect(resolveVersion([], null)).toBeUndefined();
  });
});
