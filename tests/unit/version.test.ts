import { describe, it, expect } from "vitest";
import { APP_VERSION, BUILD_NUMBER } from "@/lib/version";

describe("version", () => {
  it("exports APP_VERSION as a semver string", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("exports BUILD_NUMBER as a numeric string", () => {
    expect(BUILD_NUMBER).toMatch(/^\d+$/);
  });
});
