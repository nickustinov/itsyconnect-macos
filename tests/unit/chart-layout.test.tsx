import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Bar, BarChart, XAxis } from "recharts";
import { PAIRED_BAR_GAP } from "@/lib/chart-layout";

// 90 days of two side-by-side bars, the shape of "Installations and deletions"
const days = Array.from({ length: 90 }, (_, i) => ({ date: `d${i}`, installs: 20, deletes: 5 }));

function barWidths(width: number, barGap?: string): number[] {
  const markup = renderToStaticMarkup(
    <BarChart width={width} height={200} data={days} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barGap={barGap}>
      <XAxis dataKey="date" hide />
      <Bar dataKey="installs" isAnimationActive={false} />
      <Bar dataKey="deletes" isAnimationActive={false} />
    </BarChart>,
  );
  // Each bar is a path "M x,y h <width> v ..."
  return [...markup.matchAll(/class="recharts-rectangle"[^>]*d="M [\d.]+,[\d.]+ h ([\d.]+)/g)].map((m) => Number(m[1]));
}

describe("PAIRED_BAR_GAP", () => {
  it("reproduces the bug: Recharts' fixed 4 px gap leaves sub-pixel bars at some widths", () => {
    // 490 px for 90 days: each day is ~5.4 px, the 4 px gap leaves ~0.2 px per bar
    const widths = barWidths(490);
    expect(widths.length).toBe(180);
    expect(Math.max(...widths)).toBeLessThan(0.5);
  });

  it("keeps bars at least a pixel wide at every card width", () => {
    for (let width = 300; width <= 1000; width += 10) {
      const widths = barWidths(width, PAIRED_BAR_GAP);
      expect(widths.length, `at ${width} px`).toBe(180);
      expect(Math.min(...widths), `at ${width} px`).toBeGreaterThanOrEqual(1);
    }
  });
});
