import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAIGuidance = vi.fn();
const mockSetAIGuidance = vi.fn();

vi.mock("@/lib/app-preferences", () => ({
  getAIGuidance: (...args: unknown[]) => mockGetAIGuidance(...args),
  setAIGuidance: (...args: unknown[]) => mockSetAIGuidance(...args),
}));

describe("ai-guidance route", () => {
  beforeEach(() => {
    mockGetAIGuidance.mockReset();
    mockSetAIGuidance.mockReset();
    vi.resetModules();
  });

  it("GET returns the guidance for the requested scope", async () => {
    mockGetAIGuidance.mockReturnValue("always sign off as me, not us");
    const { GET } = await import("@/app/api/app-preferences/ai-guidance/route");

    const response = await GET(
      new Request("http://localhost/api/app-preferences/ai-guidance?scope=reviews"),
    );
    const data = await response.json();

    expect(mockGetAIGuidance).toHaveBeenCalledWith("reviews");
    expect(data).toEqual({ scope: "reviews", guidance: "always sign off as me, not us" });
  });

  it("GET defaults to the translation scope when none is given", async () => {
    mockGetAIGuidance.mockReturnValue("");
    const { GET } = await import("@/app/api/app-preferences/ai-guidance/route");

    const response = await GET(new Request("http://localhost/api/app-preferences/ai-guidance"));
    const data = await response.json();

    expect(mockGetAIGuidance).toHaveBeenCalledWith("translation");
    expect(data.scope).toBe("translation");
  });

  it("PUT trims and stores the guidance for the scope", async () => {
    const { PUT } = await import("@/app/api/app-preferences/ai-guidance/route");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "translation", guidance: "  write in British English  " }),
      }),
    );
    const data = await response.json();

    expect(mockSetAIGuidance).toHaveBeenCalledWith("translation", "write in British English");
    expect(data).toEqual({ scope: "translation", guidance: "write in British English" });
  });

  it("PUT allows clearing the guidance", async () => {
    const { PUT } = await import("@/app/api/app-preferences/ai-guidance/route");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "reviews", guidance: "" }),
      }),
    );
    const data = await response.json();

    expect(mockSetAIGuidance).toHaveBeenCalledWith("reviews", "");
    expect(data.guidance).toBe("");
  });

  it("PUT rejects an unknown scope", async () => {
    const { PUT } = await import("@/app/api/app-preferences/ai-guidance/route");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "nonsense", guidance: "x" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockSetAIGuidance).not.toHaveBeenCalled();
  });

  it("PUT rejects guidance over the length limit", async () => {
    const { PUT } = await import("@/app/api/app-preferences/ai-guidance/route");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "translation", guidance: "x".repeat(2001) }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockSetAIGuidance).not.toHaveBeenCalled();
  });
});
