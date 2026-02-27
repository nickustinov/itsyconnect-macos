import { describe, it, expect } from "vitest";
import {
  ANALYTICS_DAYS,
  formatDate,
  DAILY_REVENUE,
  REVENUE_BY_TERRITORY,
  REVENUE_BY_PRODUCT,
  TRANSACTION_TYPES,
  PROCEEDS_BY_CURRENCY,
  MONTHLY_SUMMARY,
  RECENT_TRANSACTIONS,
  PRODUCT_TYPE_LABELS,
} from "@/lib/mock-sales";

describe("mock-sales", () => {
  describe("re-exports from mock-analytics", () => {
    it("re-exports ANALYTICS_DAYS", () => {
      expect(ANALYTICS_DAYS).toHaveLength(30);
    });

    it("re-exports formatDate", () => {
      expect(formatDate("2026-01-27")).toBe("27 Jan");
    });
  });

  describe("DAILY_REVENUE", () => {
    it("has 30 entries", () => {
      expect(DAILY_REVENUE).toHaveLength(30);
    });

    it("each entry has required fields", () => {
      for (const entry of DAILY_REVENUE) {
        expect(entry).toHaveProperty("date");
        expect(entry).toHaveProperty("units");
        expect(entry).toHaveProperty("proceeds");
        expect(entry).toHaveProperty("sales");
        expect(entry).toHaveProperty("refunds");
        expect(entry).toHaveProperty("refundAmount");
        expect(typeof entry.units).toBe("number");
        expect(typeof entry.proceeds).toBe("number");
      }
    });
  });

  describe("REVENUE_BY_TERRITORY", () => {
    it("has entries with required fields", () => {
      expect(REVENUE_BY_TERRITORY.length).toBeGreaterThan(0);
      for (const t of REVENUE_BY_TERRITORY) {
        expect(t).toHaveProperty("territory");
        expect(t).toHaveProperty("code");
        expect(t).toHaveProperty("currency");
        expect(t).toHaveProperty("units");
        expect(t).toHaveProperty("proceeds");
        expect(t).toHaveProperty("sales");
      }
    });
  });

  describe("REVENUE_BY_PRODUCT", () => {
    it("has entries with required fields", () => {
      expect(REVENUE_BY_PRODUCT.length).toBeGreaterThan(0);
      for (const p of REVENUE_BY_PRODUCT) {
        expect(p).toHaveProperty("sku");
        expect(p).toHaveProperty("name");
        expect(p).toHaveProperty("type");
        expect(p).toHaveProperty("typeCode");
        expect(p).toHaveProperty("units");
        expect(p).toHaveProperty("proceeds");
      }
    });
  });

  describe("TRANSACTION_TYPES", () => {
    it("has entries with required fields", () => {
      expect(TRANSACTION_TYPES.length).toBeGreaterThan(0);
      for (const t of TRANSACTION_TYPES) {
        expect(t).toHaveProperty("type");
        expect(t).toHaveProperty("label");
        expect(t).toHaveProperty("count");
        expect(t).toHaveProperty("fill");
      }
    });
  });

  describe("PROCEEDS_BY_CURRENCY", () => {
    it("has entries with required fields", () => {
      expect(PROCEEDS_BY_CURRENCY.length).toBeGreaterThan(0);
      for (const c of PROCEEDS_BY_CURRENCY) {
        expect(c).toHaveProperty("currency");
        expect(c).toHaveProperty("label");
        expect(c).toHaveProperty("amount");
        expect(c).toHaveProperty("fill");
      }
    });
  });

  describe("MONTHLY_SUMMARY", () => {
    it("has entries with required fields", () => {
      expect(MONTHLY_SUMMARY.length).toBeGreaterThan(0);
      for (const m of MONTHLY_SUMMARY) {
        expect(m).toHaveProperty("month");
        expect(m).toHaveProperty("label");
        expect(m).toHaveProperty("units");
        expect(m).toHaveProperty("proceeds");
        expect(m).toHaveProperty("sales");
        expect(m).toHaveProperty("refunds");
        expect(m).toHaveProperty("territories");
      }
    });
  });

  describe("RECENT_TRANSACTIONS", () => {
    it("has entries with required fields", () => {
      expect(RECENT_TRANSACTIONS.length).toBeGreaterThan(0);
      for (const t of RECENT_TRANSACTIONS) {
        expect(t).toHaveProperty("date");
        expect(t).toHaveProperty("product");
        expect(t).toHaveProperty("type");
        expect(t).toHaveProperty("territory");
        expect(t).toHaveProperty("currency");
        expect(t).toHaveProperty("customerPrice");
        expect(t).toHaveProperty("proceeds");
        expect(t).toHaveProperty("units");
      }
    });
  });

  describe("PRODUCT_TYPE_LABELS", () => {
    it("maps known type codes to labels", () => {
      expect(PRODUCT_TYPE_LABELS["F1"]).toBe("Download");
      expect(PRODUCT_TYPE_LABELS["IA1-M"]).toBe("IAP purchase");
    });

    it("has string values", () => {
      for (const [key, value] of Object.entries(PRODUCT_TYPE_LABELS)) {
        expect(typeof key).toBe("string");
        expect(typeof value).toBe("string");
      }
    });
  });
});
