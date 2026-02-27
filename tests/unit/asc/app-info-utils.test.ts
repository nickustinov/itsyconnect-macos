import { describe, it, expect } from "vitest";
import { pickAppInfo } from "@/lib/asc/app-info-utils";
import type { AscAppInfo } from "@/lib/asc/app-info";

function makeAppInfo(id: string, state: string): AscAppInfo {
  return {
    id,
    attributes: {
      appStoreState: "READY_FOR_SALE",
      appStoreAgeRating: null,
      brazilAgeRating: null,
      brazilAgeRatingV2: null,
      kidsAgeBand: null,
      state,
    },
    primaryCategory: null,
    secondaryCategory: null,
  };
}

describe("pickAppInfo", () => {
  it("returns undefined for empty array", () => {
    expect(pickAppInfo([])).toBeUndefined();
  });

  it("returns the only item for single-element array", () => {
    const info = makeAppInfo("1", "READY_FOR_DISTRIBUTION");
    expect(pickAppInfo([info])).toBe(info);
  });

  it("prefers editable (non-live) appInfo over live", () => {
    const live = makeAppInfo("1", "READY_FOR_DISTRIBUTION");
    const editable = makeAppInfo("2", "PREPARE_FOR_SUBMISSION");
    expect(pickAppInfo([live, editable])).toBe(editable);
  });

  it("prefers non-ACCEPTED appInfo over ACCEPTED", () => {
    const accepted = makeAppInfo("1", "ACCEPTED");
    const pending = makeAppInfo("2", "PENDING_RELEASE");
    expect(pickAppInfo([accepted, pending])).toBe(pending);
  });

  it("falls back to first entry when all are live", () => {
    const live1 = makeAppInfo("1", "READY_FOR_DISTRIBUTION");
    const live2 = makeAppInfo("2", "ACCEPTED");
    expect(pickAppInfo([live1, live2])).toBe(live1);
  });
});
