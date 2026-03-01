import { describe, it, expect } from "vitest";
import { errorJson, parseBody } from "@/lib/api-helpers";
import { z } from "zod";

describe("api-helpers", () => {
  describe("errorJson", () => {
    it("extracts message from Error instances", async () => {
      const res = errorJson(new Error("something broke"));
      const body = await res.json();
      expect(res.status).toBe(502);
      expect(body.error).toBe("something broke");
    });

    it("uses fallback for non-Error values", async () => {
      const res = errorJson("string error");
      const body = await res.json();
      expect(body.error).toBe("Unknown error");
    });

    it("accepts custom status and fallback", async () => {
      const res = errorJson(42, 500, "Custom fallback");
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body.error).toBe("Custom fallback");
    });
  });

  describe("parseBody", () => {
    const schema = z.object({ name: z.string(), age: z.number() });

    function makeRequest(body: unknown): Request {
      return new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    it("returns parsed data for valid input", async () => {
      const result = await parseBody(makeRequest({ name: "Alice", age: 30 }), schema);
      expect(result).toEqual({ name: "Alice", age: 30 });
    });

    it("returns 400 Response for invalid JSON", async () => {
      const req = new Request("http://localhost", {
        method: "POST",
        body: "not json",
      });
      const result = await parseBody(req, schema);
      expect(result).toBeInstanceOf(Response);
      const body = await (result as Response).json();
      expect(body.error).toBe("Invalid JSON body");
    });

    it("returns 400 Response for schema validation failure", async () => {
      const result = await parseBody(makeRequest({ name: 123 }), schema);
      expect(result).toBeInstanceOf(Response);
      const body = await (result as Response).json();
      expect(body.error).toBe("Validation failed");
      expect(body.details).toBeDefined();
    });
  });
});
