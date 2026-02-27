import { describe, it, expect } from "vitest";
import {
  getVersionPlatforms,
  getVersionsByPlatform,
  resolveVersion,
  EDITABLE_STATES,
  PLATFORM_LABELS,
  STATE_DOT_COLORS,
  stateLabel,
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

describe("EDITABLE_STATES", () => {
  it("contains all four editable states", () => {
    expect(EDITABLE_STATES.has("PREPARE_FOR_SUBMISSION")).toBe(true);
    expect(EDITABLE_STATES.has("REJECTED")).toBe(true);
    expect(EDITABLE_STATES.has("METADATA_REJECTED")).toBe(true);
    expect(EDITABLE_STATES.has("DEVELOPER_REJECTED")).toBe(true);
  });

  it("does not contain non-editable states", () => {
    expect(EDITABLE_STATES.has("READY_FOR_SALE")).toBe(false);
    expect(EDITABLE_STATES.has("IN_REVIEW")).toBe(false);
  });
});

describe("PLATFORM_LABELS", () => {
  it("maps platform keys to display labels", () => {
    expect(PLATFORM_LABELS.IOS).toBe("iOS");
    expect(PLATFORM_LABELS.MAC_OS).toBe("macOS");
    expect(PLATFORM_LABELS.TV_OS).toBe("tvOS");
    expect(PLATFORM_LABELS.VISION_OS).toBe("visionOS");
  });

  it("has exactly 4 entries", () => {
    expect(Object.keys(PLATFORM_LABELS)).toHaveLength(4);
  });
});

describe("STATE_DOT_COLORS", () => {
  it("maps states to Tailwind bg classes", () => {
    expect(STATE_DOT_COLORS.READY_FOR_SALE).toBe("bg-green-500");
    expect(STATE_DOT_COLORS.IN_REVIEW).toBe("bg-blue-500");
    expect(STATE_DOT_COLORS.WAITING_FOR_REVIEW).toBe("bg-amber-500");
    expect(STATE_DOT_COLORS.PREPARE_FOR_SUBMISSION).toBe("bg-yellow-500");
    expect(STATE_DOT_COLORS.REJECTED).toBe("bg-red-500");
  });

  it("has 9 entries", () => {
    expect(Object.keys(STATE_DOT_COLORS)).toHaveLength(9);
  });
});

describe("stateLabel", () => {
  it("converts UPPER_SNAKE_CASE to Title Case", () => {
    expect(stateLabel("READY_FOR_SALE")).toBe("Ready For Sale");
    expect(stateLabel("PREPARE_FOR_SUBMISSION")).toBe("Prepare For Submission");
  });

  it("handles single-word states", () => {
    expect(stateLabel("REJECTED")).toBe("Rejected");
  });
});
