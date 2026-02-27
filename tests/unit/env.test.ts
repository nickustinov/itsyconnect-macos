import { describe, it, expect, vi, beforeEach } from "vitest";

const VALID_KEY =
  "9fce91a7ca8c37d1f9e0280d897274519bfc81d9ef8876707bc2ff0727680462";

async function loadEnv(vars: Record<string, string>) {
  vi.resetModules();
  const original = { ...process.env };
  // Strip relevant vars
  delete process.env.ENCRYPTION_MASTER_KEY;
  delete process.env.DATABASE_PATH;
  delete process.env.PORT;
  // Apply test vars
  Object.assign(process.env, vars);
  try {
    return await import("@/lib/env");
  } finally {
    // Restore
    process.env = original;
  }
}

describe("env", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("parses valid env with required vars only", async () => {
    const mod = await loadEnv({ ENCRYPTION_MASTER_KEY: VALID_KEY });
    expect(mod.env.ENCRYPTION_MASTER_KEY).toBe(VALID_KEY);
    expect(mod.env.PORT).toBe(3000); // default
  });

  it("parses valid env with all optional vars", async () => {
    const mod = await loadEnv({
      ENCRYPTION_MASTER_KEY: VALID_KEY,
      DATABASE_PATH: "/data/itsyship.db",
      PORT: "8080",
    });
    expect(mod.env.DATABASE_PATH).toBe("/data/itsyship.db");
    expect(mod.env.PORT).toBe(8080);
  });

  it("throws when ENCRYPTION_MASTER_KEY is missing", async () => {
    await expect(loadEnv({})).rejects.toThrow("Invalid environment variables");
  });

  it("throws for non-hex ENCRYPTION_MASTER_KEY", async () => {
    await expect(
      loadEnv({
        ENCRYPTION_MASTER_KEY:
          "zzzz91a7ca8c37d1f9e0280d897274519bfc81d9ef8876707bc2ff0727680462",
      }),
    ).rejects.toThrow("Invalid environment variables");
  });

  it("throws for short ENCRYPTION_MASTER_KEY", async () => {
    await expect(
      loadEnv({ ENCRYPTION_MASTER_KEY: "abcdef1234" }),
    ).rejects.toThrow("Invalid environment variables");
  });

  it("throws for non-numeric PORT", async () => {
    await expect(
      loadEnv({ ENCRYPTION_MASTER_KEY: VALID_KEY, PORT: "abc" }),
    ).rejects.toThrow("Invalid environment variables");
  });

  it("throws for PORT out of range", async () => {
    await expect(
      loadEnv({ ENCRYPTION_MASTER_KEY: VALID_KEY, PORT: "99999" }),
    ).rejects.toThrow("Invalid environment variables");
  });
});
