/**
 * Mock sales & finance data modeled after real ASC Sales Reports.
 * Itsyhome is a free macOS app; revenue comes from "Lifetime Pro" IAP.
 * 30 days: Jan 27 – Feb 25, 2026.
 */

import { ANALYTICS_DAYS, formatDate, n, series } from "./mock-analytics";

// Re-export for convenience
export { ANALYTICS_DAYS, formatDate };

// ---------- Daily revenue ----------

const iapUnits = series(18, 8, 30, 0.3);
const proceedsPerUnit = 9.1; // ~$9.10 after Apple's 30% cut of $12.99

export const DAILY_REVENUE = ANALYTICS_DAYS.map((date, i) => ({
  date,
  units: iapUnits[i],
  proceeds: Math.round(iapUnits[i] * proceedsPerUnit * 100) / 100,
  sales: Math.round(iapUnits[i] * 12.99 * 100) / 100,
  refunds: Math.max(0, Math.round(n(i, 31) * 2)),
  refundAmount:
    Math.max(0, Math.round(n(i, 31) * 2)) *
    Math.round(proceedsPerUnit * 100) / 100,
}));

// ---------- Revenue by territory ----------

export const REVENUE_BY_TERRITORY = [
  { territory: "United States", code: "US", currency: "USD", units: 312, proceeds: 2839, sales: 4053 },
  { territory: "Germany", code: "DE", currency: "EUR", units: 147, proceeds: 1338, sales: 1910 },
  { territory: "United Kingdom", code: "GB", currency: "GBP", units: 89, proceeds: 810, sales: 1156 },
  { territory: "France", code: "FR", currency: "EUR", units: 72, proceeds: 655, sales: 935 },
  { territory: "Netherlands", code: "NL", currency: "EUR", units: 48, proceeds: 437, sales: 624 },
  { territory: "Canada", code: "CA", currency: "CAD", units: 41, proceeds: 373, sales: 533 },
  { territory: "Australia", code: "AU", currency: "AUD", units: 34, proceeds: 309, sales: 442 },
  { territory: "Austria", code: "AT", currency: "EUR", units: 28, proceeds: 255, sales: 364 },
  { territory: "Italy", code: "IT", currency: "EUR", units: 22, proceeds: 200, sales: 286 },
  { territory: "Denmark", code: "DK", currency: "DKK", units: 18, proceeds: 164, sales: 234 },
  { territory: "Spain", code: "ES", currency: "EUR", units: 15, proceeds: 137, sales: 195 },
  { territory: "Switzerland", code: "CH", currency: "CHF", units: 12, proceeds: 109, sales: 156 },
];

// ---------- Revenue by product ----------

export const REVENUE_BY_PRODUCT = [
  {
    sku: "com.nickustinov.itsyhome.pro.lifetime",
    name: "Lifetime Pro",
    type: "Non-consumable IAP",
    typeCode: "IA1-M",
    units: 838,
    proceeds: 7626,
    sales: 10886,
    customerPrice: 12.99,
    refunds: 12,
  },
  {
    sku: "itsyhome-macos",
    name: "Itsyhome",
    type: "Free app",
    typeCode: "F1",
    units: 4210,
    proceeds: 0,
    sales: 0,
    customerPrice: 0,
    refunds: 0,
  },
];

// ---------- Transaction types (matches ASC product type identifiers) ----------

export const TRANSACTION_TYPES = [
  { type: "iapPurchase", label: "IAP purchase", count: 838, fill: "var(--color-iapPurchase)" },
  { type: "restoredIap", label: "Restored IAP", count: 124, fill: "var(--color-restoredIap)" },
  { type: "refund", label: "Refund", count: 12, fill: "var(--color-refund)" },
];

// ---------- Proceeds by currency (from sales reports Currency of Proceeds) ----------

export const PROCEEDS_BY_CURRENCY = [
  { currency: "usd", label: "USD", amount: 2839, fill: "var(--color-usd)" },
  { currency: "eur", label: "EUR", amount: 3022, fill: "var(--color-eur)" },
  { currency: "gbp", label: "GBP", amount: 810, fill: "var(--color-gbp)" },
  { currency: "cad", label: "CAD", amount: 373, fill: "var(--color-cad)" },
  { currency: "aud", label: "AUD", amount: 309, fill: "var(--color-aud)" },
  { currency: "other", label: "Other", amount: 273, fill: "var(--color-other)" },
];

// ---------- Monthly summary ----------

export const MONTHLY_SUMMARY = [
  {
    month: "2026-02",
    label: "February 2026",
    units: 534,
    proceeds: 4859,
    sales: 6937,
    refunds: 8,
    territories: 28,
  },
  {
    month: "2026-01",
    label: "January 2026",
    units: 304,
    proceeds: 2767,
    sales: 3949,
    refunds: 4,
    territories: 22,
  },
];

// ---------- Recent transactions (last 15 detailed rows) ----------

export interface Transaction {
  date: string;
  product: string;
  type: string;
  territory: string;
  currency: string;
  customerPrice: number;
  proceeds: number;
  units: number;
}

export const RECENT_TRANSACTIONS: Transaction[] = [
  { date: "2026-02-25", product: "Lifetime Pro", type: "IA1-M", territory: "US", currency: "USD", customerPrice: 12.99, proceeds: 9.10, units: 3 },
  { date: "2026-02-25", product: "Lifetime Pro", type: "IA1-M", territory: "DE", currency: "EUR", customerPrice: 12.99, proceeds: 9.10, units: 2 },
  { date: "2026-02-25", product: "Lifetime Pro", type: "IA1-M", territory: "GB", currency: "GBP", customerPrice: 12.99, proceeds: 9.10, units: 1 },
  { date: "2026-02-25", product: "Lifetime Pro", type: "IA3-M", territory: "NL", currency: "EUR", customerPrice: 0, proceeds: 0, units: 1 },
  { date: "2026-02-24", product: "Lifetime Pro", type: "IA1-M", territory: "US", currency: "USD", customerPrice: 12.99, proceeds: 9.10, units: 5 },
  { date: "2026-02-24", product: "Lifetime Pro", type: "IA1-M", territory: "FR", currency: "EUR", customerPrice: 12.99, proceeds: 9.10, units: 2 },
  { date: "2026-02-24", product: "Lifetime Pro", type: "IA1-M", territory: "CA", currency: "CAD", customerPrice: 16.99, proceeds: 11.90, units: 1 },
  { date: "2026-02-24", product: "Lifetime Pro", type: "IA1-M", territory: "DK", currency: "DKK", customerPrice: 99.00, proceeds: 55.44, units: 1 },
  { date: "2026-02-23", product: "Lifetime Pro", type: "IA1-M", territory: "US", currency: "USD", customerPrice: 12.99, proceeds: 9.10, units: 4 },
  { date: "2026-02-23", product: "Lifetime Pro", type: "IA1-M", territory: "AU", currency: "AUD", customerPrice: 21.99, proceeds: 15.00, units: 2 },
  { date: "2026-02-23", product: "Lifetime Pro", type: "IA1-M", territory: "AT", currency: "EUR", customerPrice: 12.99, proceeds: 9.10, units: 1 },
  { date: "2026-02-22", product: "Lifetime Pro", type: "IA1-M", territory: "US", currency: "USD", customerPrice: 12.99, proceeds: 9.10, units: 6 },
  { date: "2026-02-22", product: "Lifetime Pro", type: "IA1-M", territory: "DE", currency: "EUR", customerPrice: 12.99, proceeds: 9.10, units: 3 },
  { date: "2026-02-22", product: "Lifetime Pro", type: "IA1-M", territory: "CH", currency: "CHF", customerPrice: 13.00, proceeds: 8.84, units: 1 },
  { date: "2026-02-22", product: "Lifetime Pro", type: "IA1-M", territory: "IT", currency: "EUR", customerPrice: 12.99, proceeds: 9.10, units: 2 },
];

// ---------- Product type labels ----------

export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  "F1": "Download",
  "F3": "Redownload",
  "F7": "Update",
  "IA1-M": "IAP purchase",
  "IA3-M": "Restored IAP",
};
