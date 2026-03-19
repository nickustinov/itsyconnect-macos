import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetReviewBeforeSaving = vi.fn();
const mockSetReviewBeforeSaving = vi.fn();

vi.mock("@/lib/app-preferences", () => ({
  getReviewBeforeSaving: () => mockGetReviewBeforeSaving(),
  setReviewBeforeSaving: (...args: unknown[]) => mockSetReviewBeforeSaving(...args),
}));

describe("review-mode route", () => {
  beforeEach(() => {
    mockGetReviewBeforeSaving.mockReset();
    mockSetReviewBeforeSaving.mockReset();
    vi.resetModules();
  });

  it("GET returns current review mode state", async () => {
    mockGetReviewBeforeSaving.mockReturnValue(true);
    const { GET } = await import("@/app/api/app-preferences/review-mode/route");

    const response = await GET();
    const data = await response.json();

    expect(data.enabled).toBe(true);
  });

  it("GET returns false when disabled", async () => {
    mockGetReviewBeforeSaving.mockReturnValue(false);
    const { GET } = await import("@/app/api/app-preferences/review-mode/route");

    const response = await GET();
    const data = await response.json();

    expect(data.enabled).toBe(false);
  });

  it("PUT enables review mode", async () => {
    const { PUT } = await import("@/app/api/app-preferences/review-mode/route");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }),
    );
    const data = await response.json();

    expect(mockSetReviewBeforeSaving).toHaveBeenCalledWith(true);
    expect(data.enabled).toBe(true);
  });

  it("PUT disables review mode", async () => {
    const { PUT } = await import("@/app/api/app-preferences/review-mode/route");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }),
    );
    const data = await response.json();

    expect(mockSetReviewBeforeSaving).toHaveBeenCalledWith(false);
    expect(data.enabled).toBe(false);
  });

  it("PUT treats non-boolean enabled as false", async () => {
    const { PUT } = await import("@/app/api/app-preferences/review-mode/route");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: "yes" }),
      }),
    );
    const data = await response.json();

    expect(mockSetReviewBeforeSaving).toHaveBeenCalledWith(false);
    expect(data.enabled).toBe(false);
  });
});
