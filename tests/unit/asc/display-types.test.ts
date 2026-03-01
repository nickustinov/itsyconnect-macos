import { describe, it, expect } from "vitest";
import {
  displayTypeLabel,
  sortDisplayTypes,
  screenshotImageUrl,
  screenshotErrorMessage,
  getDeviceCategory,
  DISPLAY_TYPE_LABELS,
  DISPLAY_TYPE_ORDER,
  BUILD_STATUS_DOTS,
  TESTER_STATUS_DOTS,
} from "@/lib/asc/display-types";

describe("display-types", () => {
  describe("DISPLAY_TYPE_LABELS", () => {
    it("is a non-empty record", () => {
      expect(Object.keys(DISPLAY_TYPE_LABELS).length).toBeGreaterThan(0);
    });

    it("maps known types to labels", () => {
      expect(DISPLAY_TYPE_LABELS.APP_IPHONE_67).toBe('iPhone 6.7"');
      expect(DISPLAY_TYPE_LABELS.APP_DESKTOP).toBe("Mac");
    });
  });

  describe("displayTypeLabel", () => {
    it("returns the label for a known display type", () => {
      expect(displayTypeLabel("APP_IPHONE_67")).toBe('iPhone 6.7"');
      expect(displayTypeLabel("APP_APPLE_TV")).toBe("Apple TV");
    });

    it("returns the type string itself for an unknown type", () => {
      expect(displayTypeLabel("UNKNOWN_TYPE")).toBe("UNKNOWN_TYPE");
    });
  });

  describe("sortDisplayTypes", () => {
    it("sorts types according to DISPLAY_TYPE_ORDER", () => {
      const input = ["APP_DESKTOP", "APP_IPHONE_67", "APP_IPAD_97"];
      const sorted = sortDisplayTypes(input);
      expect(sorted).toEqual(["APP_IPHONE_67", "APP_IPAD_97", "APP_DESKTOP"]);
    });

    it("places unknown types at the end, sorted alphabetically", () => {
      const input = ["UNKNOWN_B", "APP_IPHONE_67", "UNKNOWN_A"];
      const sorted = sortDisplayTypes(input);
      expect(sorted).toEqual(["APP_IPHONE_67", "UNKNOWN_A", "UNKNOWN_B"]);
    });

    it("does not mutate the original array", () => {
      const input = ["APP_DESKTOP", "APP_IPHONE_67"];
      sortDisplayTypes(input);
      expect(input).toEqual(["APP_DESKTOP", "APP_IPHONE_67"]);
    });

    it("returns empty array for empty input", () => {
      expect(sortDisplayTypes([])).toEqual([]);
    });

    it("matches all items in DISPLAY_TYPE_ORDER", () => {
      const sorted = sortDisplayTypes([...DISPLAY_TYPE_ORDER].reverse());
      expect(sorted).toEqual(DISPLAY_TYPE_ORDER);
    });
  });

  describe("getDeviceCategory", () => {
    it("returns the category for a known iPhone type", () => {
      expect(getDeviceCategory("APP_IPHONE_67")).toBe("iPhone");
    });

    it("returns the category for an iPad type", () => {
      expect(getDeviceCategory("APP_IPAD_PRO_3GEN_129")).toBe("iPad");
    });

    it("returns undefined for an unknown display type", () => {
      expect(getDeviceCategory("UNKNOWN_TYPE")).toBeUndefined();
    });
  });

  describe("screenshotErrorMessage", () => {
    it("returns human message for known error code", () => {
      expect(
        screenshotErrorMessage([{ code: "IMAGE_BAD_DIMENSION_SM_LESS_MIN", description: "IMAGE_BAD_DIMENSION_SM_LESS_MIN" }]),
      ).toBe("Image is too small for this display type");
    });

    it("falls back to description for unknown error code", () => {
      expect(
        screenshotErrorMessage([{ code: "NEW_UNKNOWN_CODE", description: "Something went wrong" }]),
      ).toBe("Something went wrong");
    });

    it("falls back to 'Processing failed' when description is nullish", () => {
      expect(
        screenshotErrorMessage([{ code: "UNKNOWN", description: undefined as unknown as string }]),
      ).toBe("Processing failed");
    });

    it("returns generic message for empty errors array", () => {
      expect(screenshotErrorMessage([])).toBe("Processing failed");
    });

    it("maps all known error codes", () => {
      const knownCodes = [
        "IMAGE_BAD_DIMENSION_SM_LESS_MIN",
        "IMAGE_BAD_DIMENSION_SM_OVER_MAX",
        "IMG_BAD_DIMENSIONS",
        "IMG_BAD_COLOR_SPACE",
        "IMG_APPEARS_CORRUPT",
        "IMAGE_TOOL_FAILURE",
        "IMG_BAD_FORMAT",
      ];
      for (const code of knownCodes) {
        const msg = screenshotErrorMessage([{ code, description: code }]);
        expect(msg).not.toBe(code);
      }
    });
  });

  describe("BUILD_STATUS_DOTS", () => {
    it("maps active statuses to green", () => {
      expect(BUILD_STATUS_DOTS["Testing"]).toBe("bg-green-500");
      expect(BUILD_STATUS_DOTS["Ready to test"]).toBe("bg-green-500");
    });

    it("maps expired/invalid statuses to red", () => {
      expect(BUILD_STATUS_DOTS["Expired"]).toBe("bg-red-500");
      expect(BUILD_STATUS_DOTS["Invalid"]).toBe("bg-red-500");
    });

    it("returns undefined for unknown status", () => {
      expect(BUILD_STATUS_DOTS["Nonexistent"]).toBeUndefined();
    });
  });

  describe("TESTER_STATUS_DOTS", () => {
    it("maps installed to green", () => {
      expect(TESTER_STATUS_DOTS["INSTALLED"]).toBe("bg-green-500");
    });

    it("maps revoked to red", () => {
      expect(TESTER_STATUS_DOTS["REVOKED"]).toBe("bg-red-500");
    });
  });

  describe("screenshotImageUrl", () => {
    it("builds a CDN URL with default width", () => {
      expect(screenshotImageUrl("Purple/v4/abc")).toBe(
        "https://is1-ssl.mzstatic.com/image/thumb/Purple/v4/abc/300x0w.png",
      );
    });

    it("builds a CDN URL with custom width", () => {
      expect(screenshotImageUrl("Purple/v4/abc", 600)).toBe(
        "https://is1-ssl.mzstatic.com/image/thumb/Purple/v4/abc/600x0w.png",
      );
    });
  });
});
