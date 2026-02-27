import { describe, it, expect, vi, beforeEach } from "vitest";

describe("rate-limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function getAcquireToken() {
    const mod = await import("@/lib/asc/rate-limit");
    return mod.acquireToken;
  }

  it("allows 5 immediate requests (full bucket)", async () => {
    const acquireToken = await getAcquireToken();
    for (let i = 0; i < 5; i++) {
      await acquireToken();
    }
  });

  it("6th request blocks until a token refills", async () => {
    const acquireToken = await getAcquireToken();

    // Drain the bucket
    for (let i = 0; i < 5; i++) {
      await acquireToken();
    }

    let resolved = false;
    const p = acquireToken().then(() => {
      resolved = true;
    });

    // Not yet resolved
    expect(resolved).toBe(false);

    // Advance time enough for 1 token to refill (200ms for 5 tokens/sec)
    await vi.advanceTimersByTimeAsync(250);
    await p;
    expect(resolved).toBe(true);
  });

  it("tokens refill over time", async () => {
    const acquireToken = await getAcquireToken();

    // Drain the bucket
    for (let i = 0; i < 5; i++) {
      await acquireToken();
    }

    // Advance 1 second – should refill all 5 tokens
    vi.advanceTimersByTime(1000);

    // Should be able to acquire 5 more without blocking
    for (let i = 0; i < 5; i++) {
      await acquireToken();
    }
  });
});
