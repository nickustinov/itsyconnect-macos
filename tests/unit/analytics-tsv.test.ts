import { describe, it, expect } from "vitest";
import { parseTsv } from "@/lib/asc/analytics";

describe("parseTsv", () => {
  it("parses valid TSV with headers and rows", () => {
    const tsv = [
      "Date\tDownload Type\tTerritory\tCounts",
      "2026-02-01\tFirst-time download\tUS\t42",
      "2026-02-01\tRedownload\tDE\t15",
    ].join("\n");

    const result = parseTsv(tsv);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      Date: "2026-02-01",
      "Download Type": "First-time download",
      Territory: "US",
      Counts: "42",
    });
    expect(result[1]).toEqual({
      Date: "2026-02-01",
      "Download Type": "Redownload",
      Territory: "DE",
      Counts: "15",
    });
  });

  it("returns empty array for empty input", () => {
    expect(parseTsv("")).toEqual([]);
    expect(parseTsv("\n")).toEqual([]);
    expect(parseTsv("  \n  ")).toEqual([]);
  });

  it("returns empty array for header-only input", () => {
    const tsv = "Date\tDownloads\tTerritory";
    expect(parseTsv(tsv)).toEqual([]);
  });

  it("handles rows with fewer columns than headers", () => {
    const tsv = "A\tB\tC\n1\t2";
    const result = parseTsv(tsv);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ A: "1", B: "2", C: "" });
  });

  it("strips surrounding quotes from field values", () => {
    const tsv = 'Name\tValue\n"hello"\t"world"';
    const result = parseTsv(tsv);
    expect(result[0]).toEqual({ Name: "hello", Value: "world" });
  });

  it("handles trailing newlines", () => {
    const tsv = "A\tB\n1\t2\n";
    const result = parseTsv(tsv);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ A: "1", B: "2" });
  });

  it("handles multiple data rows", () => {
    const tsv = [
      "Date\tEvent\tCounts",
      "2026-02-01\tImpression\t3000",
      "2026-02-01\tPage view\t500",
      "2026-02-02\tImpression\t3100",
      "2026-02-02\tPage view\t520",
    ].join("\n");

    const result = parseTsv(tsv);
    expect(result).toHaveLength(4);
    expect(result[2]["Event"]).toBe("Impression");
    expect(result[2]["Counts"]).toBe("3100");
  });
});
