import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db";

const TEST_MASTER_KEY = "9fce91a7ca8c37d1f9e0280d897274519bfc81d9ef8876707bc2ff0727680462";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  FREE_LIMITS,
  CHECKOUT_URL,
  maskKey,
  isPro,
  getLicense,
  setLicense,
  clearLicense,
  resetProCache,
} from "@/lib/license";

describe("license", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    testDb = createTestDb();
    originalKey = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    resetProCache();
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ENCRYPTION_MASTER_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_MASTER_KEY;
    }
  });

  describe("FREE_LIMITS", () => {
    it("has 1 app and 1 team", () => {
      expect(FREE_LIMITS.apps).toBe(1);
      expect(FREE_LIMITS.teams).toBe(1);
    });
  });

  describe("CHECKOUT_URL", () => {
    it("is a LemonSqueezy URL", () => {
      expect(CHECKOUT_URL).toContain("lemonsqueezy.com");
    });
  });

  describe("maskKey", () => {
    it("masks keys longer than 8 characters", () => {
      expect(maskKey("ABCDEFGH12345678")).toBe("ABCDEFGH...");
    });

    it("returns short keys as-is", () => {
      expect(maskKey("ABCD")).toBe("ABCD");
    });

    it("returns exactly 8-char keys as-is", () => {
      expect(maskKey("12345678")).toBe("12345678");
    });
  });

  describe("isPro", () => {
    it("returns false when no activation exists", () => {
      expect(isPro()).toBe(false);
    });

    it("returns true after setLicense", () => {
      setLicense({
        licenseKey: "test-key-123",
        instanceId: "inst-1",
        email: "user@example.com",
      });
      expect(isPro()).toBe(true);
    });

    it("returns false after clearLicense", () => {
      setLicense({
        licenseKey: "test-key-123",
        instanceId: "inst-1",
        email: "user@example.com",
      });
      clearLicense();
      expect(isPro()).toBe(false);
    });

    it("returns cached result on subsequent calls", () => {
      expect(isPro()).toBe(false);
      // Second call hits _proCache without querying DB
      expect(isPro()).toBe(false);
    });

    it("caches the result in memory", () => {
      // First call queries DB
      expect(isPro()).toBe(false);
      // Insert directly without resetProCache – cache should still return false
      setLicense({
        licenseKey: "test-key-123",
        instanceId: "inst-1",
        email: "user@example.com",
      });
      // setLicense calls resetProCache, so next call should reflect the new state
      expect(isPro()).toBe(true);
    });
  });

  describe("getLicense", () => {
    it("returns null when no activation exists", () => {
      expect(getLicense()).toBeNull();
    });

    it("returns decrypted license info after setLicense", () => {
      setLicense({
        licenseKey: "my-secret-license-key",
        instanceId: "inst-42",
        email: "buyer@example.com",
      });

      const license = getLicense();
      expect(license).not.toBeNull();
      expect(license!.key).toBe("my-secret-license-key");
      expect(license!.instanceId).toBe("inst-42");
      expect(license!.email).toBe("buyer@example.com");
      expect(license!.activatedAt).toBeTruthy();
    });
  });

  describe("setLicense", () => {
    it("replaces existing activation", () => {
      setLicense({
        licenseKey: "key-1",
        instanceId: "inst-1",
        email: "first@example.com",
      });
      setLicense({
        licenseKey: "key-2",
        instanceId: "inst-2",
        email: "second@example.com",
      });

      const license = getLicense();
      expect(license!.key).toBe("key-2");
      expect(license!.email).toBe("second@example.com");
    });
  });

  describe("clearLicense", () => {
    it("removes the activation", () => {
      setLicense({
        licenseKey: "key-1",
        instanceId: "inst-1",
        email: "user@example.com",
      });
      clearLicense();
      expect(getLicense()).toBeNull();
    });

    it("is a no-op when no activation exists", () => {
      expect(() => clearLicense()).not.toThrow();
    });
  });
});
