import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../../helpers/test-db";
import { ascCredentials } from "@/db/schema";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn(() => "decrypted-private-key"),
}));

vi.mock("@/lib/asc/jwt", () => ({
  generateAscJwt: vi.fn(() => "mock-jwt-token"),
}));

vi.mock("@/lib/asc/rate-limit", () => ({
  acquireToken: vi.fn(async () => {}),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { ascFetch, hasCredentials, resetToken } from "@/lib/asc/client";
import { generateAscJwt } from "@/lib/asc/jwt";

function insertCred(active = true) {
  testDb
    .insert(ascCredentials)
    .values({
      id: "cred-1",
      issuerId: "issuer-1",
      keyId: "KEY123",
      encryptedPrivateKey: "enc-pk",
      iv: "iv",
      authTag: "tag",
      encryptedDek: "dek",
      isActive: active,
      createdAt: new Date().toISOString(),
    })
    .run();
}

describe("hasCredentials", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns false when no credentials exist", () => {
    expect(hasCredentials()).toBe(false);
  });

  it("returns true when active credential exists", () => {
    insertCred(true);
    expect(hasCredentials()).toBe(true);
  });

  it("returns false when only inactive credentials exist", () => {
    insertCred(false);
    expect(hasCredentials()).toBe(false);
  });
});

describe("ascFetch", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockFetch.mockReset();
    vi.mocked(generateAscJwt).mockReturnValue("mock-jwt-token");
  });

  it("throws when no credentials are configured", async () => {
    await expect(ascFetch("/v1/apps")).rejects.toThrow(
      "No active ASC credentials configured",
    );
  });

  it("makes an authenticated request and returns data", async () => {
    insertCred();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: "app-1" }] }),
    });

    const result = await ascFetch("/v1/apps");
    expect(result).toEqual({ data: [{ id: "app-1" }] });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.appstoreconnect.apple.com/v1/apps",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer mock-jwt-token",
        }),
      }),
    );
  });

  it("retries on 429 with exponential backoff", async () => {
    insertCred();
    vi.useFakeTimers();

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

    const promise = ascFetch("/v1/apps");
    // First retry waits 1s (2^0 * 1000)
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result).toEqual({ data: [] });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("throws on non-429 errors", async () => {
    insertCred();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    await expect(ascFetch("/v1/apps")).rejects.toThrow("ASC API 401");
  });

  it("handles response.text() throwing on error", async () => {
    insertCred();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error("body read failed")),
    });

    await expect(ascFetch("/v1/apps")).rejects.toThrow("ASC API 500");
  });

  it("returns null for 204 no-content responses", async () => {
    insertCred();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    const result = await ascFetch("/v1/appScreenshots/ss-1");
    expect(result).toBeNull();
  });

  it("includes Authorization header with JWT", async () => {
    insertCred();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await ascFetch("/v1/apps");
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers.Authorization).toBe("Bearer mock-jwt-token");
  });

  it("throws fallback error when all retries are 429", async () => {
    insertCred();
    // Mock setTimeout to resolve immediately
    const origSetTimeout = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", (fn: () => void) => origSetTimeout(fn, 0));

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 429 });

    await expect(ascFetch("/v1/apps")).rejects.toThrow(
      "ASC API request failed",
    );
    expect(mockFetch).toHaveBeenCalledTimes(3);

    vi.stubGlobal("setTimeout", origSetTimeout);
  });

  it("caches JWT and reuses it within 15 minutes", async () => {
    insertCred();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await ascFetch("/v1/apps");
    await ascFetch("/v1/apps");

    // generateAscJwt should only be called once (cached)
    expect(generateAscJwt).toHaveBeenCalledTimes(1);
  });

  it("resetToken() forces a new JWT on the next call", async () => {
    insertCred();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await ascFetch("/v1/apps");
    expect(generateAscJwt).toHaveBeenCalledTimes(1);

    resetToken();

    await ascFetch("/v1/apps");
    expect(generateAscJwt).toHaveBeenCalledTimes(2);
  });
});
