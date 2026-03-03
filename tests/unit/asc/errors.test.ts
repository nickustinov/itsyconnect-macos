import { describe, it, expect } from "vitest";
import { parseAscError, networkError } from "@/lib/asc/errors";

describe("parseAscError", () => {
  it("parses JSON errors array from response", () => {
    const body = JSON.stringify({
      errors: [
        { code: "ENTITY_ERROR", title: "Invalid", detail: "Name is required", source: { pointer: "/data/attributes/name" } },
      ],
    });
    const result = parseAscError(409, body);
    expect(result.category).toBe("api");
    expect(result.message).toBe("Name is required");
    expect(result.entries).toEqual([
      { code: "ENTITY_ERROR", title: "Invalid", detail: "Name is required", source: { pointer: "/data/attributes/name" } },
    ]);
  });

  it("handles errors array entries with missing fields", () => {
    const body = JSON.stringify({
      errors: [{ }],
    });
    const result = parseAscError(400, body);
    expect(result.entries).toEqual([
      { code: "", title: "", detail: "", source: undefined },
    ]);
  });

  it("returns auth category for 401", () => {
    const result = parseAscError(401, "Unauthorized");
    expect(result.category).toBe("auth");
    expect(result.message).toBe("API key may be invalid or expired");
  });

  it("returns auth category for 403", () => {
    const result = parseAscError(403, "Forbidden");
    expect(result.category).toBe("auth");
  });

  it("returns connection category for 5xx", () => {
    const result = parseAscError(503, "Service Unavailable");
    expect(result.category).toBe("connection");
    expect(result.message).toBe("App Store Connect is temporarily unavailable");
  });

  it("returns api category with fallback message for other status codes", () => {
    const result = parseAscError(422, "not json");
    expect(result.category).toBe("api");
    expect(result.message).toBe("App Store Connect returned an error (422)");
    expect(result.statusCode).toBe(422);
  });

  it("uses detail from JSON errors for auth responses", () => {
    const body = JSON.stringify({
      errors: [{ code: "NOT_AUTHORIZED", title: "Forbidden", detail: "Token expired" }],
    });
    const result = parseAscError(401, body);
    expect(result.category).toBe("auth");
    expect(result.message).toBe("Token expired");
    expect(result.entries).toHaveLength(1);
  });

  it("uses detail from JSON errors for 5xx responses", () => {
    const body = JSON.stringify({
      errors: [{ code: "INTERNAL", title: "Error", detail: "DB timeout" }],
    });
    const result = parseAscError(500, body);
    expect(result.category).toBe("connection");
    expect(result.message).toBe("DB timeout");
  });
});

describe("networkError", () => {
  it("returns a connection error with standard message", () => {
    const err = networkError();
    expect(err.category).toBe("connection");
    expect(err.message).toBe("Could not connect to App Store Connect");
    expect(err.statusCode).toBeUndefined();
  });
});
