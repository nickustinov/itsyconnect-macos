import { describe, it, expect } from "vitest";
import { sanitisePath, sanitiseText } from "@/lib/sanitise-error";

describe("sanitisePath", () => {
  it("replaces UUIDs with <id>", () => {
    expect(sanitisePath("/v1/apps/a1b2c3d4-e5f6-7890-abcd-ef1234567890/versions")).toBe(
      "/v1/apps/<id>/versions",
    );
  });

  it("replaces multiple UUIDs", () => {
    const path = "/v1/apps/a1b2c3d4-e5f6-7890-abcd-ef1234567890/loc/f1e2d3c4-b5a6-7890-abcd-ef1234567890";
    expect(sanitisePath(path)).toBe("/v1/apps/<id>/loc/<id>");
  });

  it("leaves paths without UUIDs unchanged", () => {
    expect(sanitisePath("/v1/apps")).toBe("/v1/apps");
  });
});

describe("sanitiseText", () => {
  it("replaces JWTs with <jwt>", () => {
    const text = "Bearer eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiIxMjM0NTY3ODkw.MEUCIQC1234567890abc";
    expect(sanitiseText(text)).toContain("<jwt>");
    expect(sanitiseText(text)).not.toContain("eyJ");
  });

  it("replaces UUIDs with <id>", () => {
    const text = "Error for a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    expect(sanitiseText(text)).toBe("Error for <id>");
  });

  it("replaces both JWTs and UUIDs", () => {
    const text = "eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiIxMjM0NTY3ODkw.MEUCIQC1234567890abc a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const result = sanitiseText(text);
    expect(result).toContain("<jwt>");
    expect(result).toContain("<id>");
  });

  it("handles undefined and null safely", () => {
    expect(sanitiseText(undefined)).toBe("");
    expect(sanitiseText(null)).toBe("");
  });
});
