import { describe, it, expect } from "vitest";
import { pushAll } from "@/lib/asc/analytics-types";

describe("pushAll", () => {
  it("appends every element, preserving order", () => {
    const target = [1, 2];
    pushAll(target, [3, 4, 5]);
    expect(target).toEqual([1, 2, 3, 4, 5]);
  });

  it("is a no-op for an empty source", () => {
    const target = [1];
    pushAll(target, []);
    expect(target).toEqual([1]);
  });

  it("handles sources far beyond the spread argument-count limit", () => {
    // `target.push(...source)` throws "RangeError: Maximum call stack size
    // exceeded" somewhere above ~100k elements because each element becomes a
    // separate argument. Analytics snapshot instances routinely exceed that.
    const source = Array.from({ length: 200_000 }, (_, i) => i);
    const target: number[] = [];

    pushAll(target, source);

    expect(target).toHaveLength(200_000);
    expect(target[0]).toBe(0);
    expect(target[199_999]).toBe(199_999);
  });
});
