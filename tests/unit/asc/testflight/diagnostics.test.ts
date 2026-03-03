import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAscFetch, MockAscApiError } = vi.hoisted(() => {
  class _AscApiError extends Error {
    readonly ascError: { category: string; message: string; statusCode?: number };
    constructor(ascError: { category: string; message: string; statusCode?: number }) {
      super(ascError.message);
      this.name = "AscApiError";
      this.ascError = ascError;
    }
  }
  return { mockAscFetch: vi.fn(), MockAscApiError: _AscApiError };
});

const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  ascFetch: (...args: unknown[]) => mockAscFetch(...args),
  AscApiError: MockAscApiError,
}));

vi.mock("@/lib/cache", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
}));

import {
  listDiagnosticSignatures,
  getDiagnosticLogs,
  parseCallStackFrame,
} from "@/lib/asc/testflight/diagnostics";
import { DIAGNOSTICS_TTL } from "@/lib/asc/testflight/types";

// ── listDiagnosticSignatures ──────────────────────────────────────

describe("listDiagnosticSignatures", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
  });

  it("returns cached data when available", async () => {
    const cached = [{ id: "sig-1", diagnosticType: "HANGS", signature: "test", weight: 0.5 }];
    mockCacheGet.mockReturnValue(cached);

    const result = await listDiagnosticSignatures("build-1");
    expect(result).toBe(cached);
    expect(mockAscFetch).not.toHaveBeenCalled();
    expect(mockCacheGet).toHaveBeenCalledWith("tf-diagnostics:build-1");
  });

  it("bypasses cache when forceRefresh is true", async () => {
    mockCacheGet.mockReturnValue([{ id: "old" }]);
    mockAscFetch.mockResolvedValue({ data: [] });

    await listDiagnosticSignatures("build-1", undefined, true);
    expect(mockCacheGet).not.toHaveBeenCalled();
    expect(mockAscFetch).toHaveBeenCalled();
  });

  it("parses signatures from API response", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "sig-1",
          attributes: {
            diagnosticType: "HANGS",
            signature: "main_thread_hang",
            weight: 0.75,
          },
        },
        {
          id: "sig-2",
          attributes: {
            diagnosticType: "DISK_WRITES",
            signature: "excessive_writes",
            weight: 0.25,
          },
        },
      ],
    });

    const result = await listDiagnosticSignatures("build-1");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "sig-1",
      diagnosticType: "HANGS",
      signature: "main_thread_hang",
      weight: 0.75,
    });
    expect(result[1]).toEqual({
      id: "sig-2",
      diagnosticType: "DISK_WRITES",
      signature: "excessive_writes",
      weight: 0.25,
    });
    expect(mockCacheSet).toHaveBeenCalledWith("tf-diagnostics:build-1", result, DIAGNOSTICS_TTL);
  });

  it("includes type filter in API request and cache key", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({ data: [] });

    await listDiagnosticSignatures("build-1", "HANGS");

    expect(mockCacheGet).toHaveBeenCalledWith("tf-diagnostics:build-1:HANGS");
    const url = mockAscFetch.mock.calls[0][0] as string;
    expect(url).toContain("filter%5BdiagnosticType%5D=HANGS");
    expect(mockCacheSet).toHaveBeenCalledWith("tf-diagnostics:build-1:HANGS", [], DIAGNOSTICS_TTL);
  });

  it("returns empty array and caches on error (best-effort)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockRejectedValue(new Error("network error"));

    const result = await listDiagnosticSignatures("build-1");

    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[diagnostics] signatures for build build-1 failed:"),
      expect.any(Error),
    );
    expect(mockCacheSet).toHaveBeenCalledWith("tf-diagnostics:build-1", [], DIAGNOSTICS_TTL);
    consoleSpy.mockRestore();
  });

  it("suppresses log on 404 (expected for builds without diagnostics)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockRejectedValue(new MockAscApiError({ category: "api", message: "Not found", statusCode: 404 }));

    const result = await listDiagnosticSignatures("build-1");

    expect(result).toEqual([]);
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(mockCacheSet).toHaveBeenCalledWith("tf-diagnostics:build-1", [], DIAGNOSTICS_TTL);
    consoleSpy.mockRestore();
  });

  it("handles empty response", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({ data: [] });

    const result = await listDiagnosticSignatures("build-1");
    expect(result).toEqual([]);
    expect(mockCacheSet).toHaveBeenCalledWith("tf-diagnostics:build-1", [], DIAGNOSTICS_TTL);
  });

  it("uses correct cache key with type filter", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({ data: [] });

    await listDiagnosticSignatures("build-1", "LAUNCHES");
    expect(mockCacheGet).toHaveBeenCalledWith("tf-diagnostics:build-1:LAUNCHES");
    expect(mockCacheSet).toHaveBeenCalledWith("tf-diagnostics:build-1:LAUNCHES", [], DIAGNOSTICS_TTL);
  });

  it("handles non-array response.data gracefully", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({ data: { notAnArray: true } });

    const result = await listDiagnosticSignatures("build-1");
    expect(result).toEqual([]);
  });
});

// ── getDiagnosticLogs ─────────────────────────────────────────────

describe("getDiagnosticLogs", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
  });

  it("parses metadata, call stack, and insights", async () => {
    mockAscFetch.mockResolvedValue({
      data: [
        {
          attributes: {
            diagnosticMetaData: { deviceType: "iPhone14,5", osVersion: "17.2" },
            callStackTree: [
              {
                callStacks: [
                  {
                    callStackRootFrames: [
                      {
                        symbolName: "main",
                        binaryName: "MyApp",
                        fileName: "main.swift",
                        lineNumber: 42,
                        address: "0x1234",
                        isBlameFrame: true,
                        sampleCount: 10,
                      },
                    ],
                  },
                ],
              },
            ],
            insights: [
              {
                category: "Performance",
                description: "Consider using background threads",
                url: "https://developer.apple.com/docs",
              },
            ],
          },
        },
      ],
    });

    const result = await getDiagnosticLogs("sig-1");

    expect(result).toHaveLength(1);
    expect(result[0].metadata).toEqual({ deviceType: "iPhone14,5", osVersion: "17.2" });
    expect(result[0].callStack).toHaveLength(1);
    expect(result[0].callStack[0]).toEqual({
      symbolName: "main",
      binaryName: "MyApp",
      fileName: "main.swift",
      lineNumber: 42,
      address: "0x1234",
      isBlameFrame: true,
      sampleCount: 10,
    });
    expect(result[0].insights).toHaveLength(1);
    expect(result[0].insights[0]).toEqual({
      category: "Performance",
      description: "Consider using background threads",
      url: "https://developer.apple.com/docs",
    });
  });

  it("handles recursive subFrames", async () => {
    mockAscFetch.mockResolvedValue({
      data: [
        {
          attributes: {
            callStackTree: [
              {
                callStacks: [
                  {
                    callStackRootFrames: [
                      {
                        symbolName: "root",
                        binaryName: "MyApp",
                        isBlameFrame: false,
                        sampleCount: 5,
                        subFrames: [
                          {
                            symbolName: "child",
                            binaryName: "MyApp",
                            isBlameFrame: true,
                            sampleCount: 3,
                            subFrames: [
                              {
                                symbolName: "grandchild",
                                binaryName: "libsystem",
                                isBlameFrame: false,
                                sampleCount: 1,
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    });

    const result = await getDiagnosticLogs("sig-1");

    expect(result).toHaveLength(1);
    const root = result[0].callStack[0];
    expect(root.symbolName).toBe("root");
    expect(root.subFrames).toHaveLength(1);
    expect(root.subFrames![0].symbolName).toBe("child");
    expect(root.subFrames![0].isBlameFrame).toBe(true);
    expect(root.subFrames![0].subFrames).toHaveLength(1);
    expect(root.subFrames![0].subFrames![0].symbolName).toBe("grandchild");
  });

  it("returns empty array on error (best-effort)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockAscFetch.mockRejectedValue(new Error("network error"));

    const result = await getDiagnosticLogs("sig-1");

    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[diagnostics] logs for signature sig-1 failed:"),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("handles missing optional fields gracefully", async () => {
    mockAscFetch.mockResolvedValue({
      data: [
        {
          attributes: {
            // No diagnosticMetaData, no callStackTree, no insights
          },
        },
      ],
    });

    const result = await getDiagnosticLogs("sig-1");

    expect(result).toHaveLength(1);
    expect(result[0].metadata).toEqual({});
    expect(result[0].callStack).toEqual([]);
    expect(result[0].insights).toEqual([]);
  });

  it("handles non-array response.data gracefully", async () => {
    mockAscFetch.mockResolvedValue({ data: { notAnArray: true } });

    const result = await getDiagnosticLogs("sig-1");
    expect(result).toEqual([]);
  });

  it("handles insights with missing fields", async () => {
    mockAscFetch.mockResolvedValue({
      data: [
        {
          attributes: {
            insights: [
              { category: "Tip" },
              { description: "Some tip" },
              {},
            ],
          },
        },
      ],
    });

    const result = await getDiagnosticLogs("sig-1");
    expect(result[0].insights).toEqual([
      { category: "Tip", description: "", url: null },
      { category: "General", description: "Some tip", url: null },
      { category: "General", description: "", url: null },
    ]);
  });
});

// ── parseCallStackFrame ───────────────────────────────────────────

describe("parseCallStackFrame", () => {
  it("parses a complete frame", () => {
    const result = parseCallStackFrame({
      symbolName: "doWork",
      binaryName: "MyApp",
      fileName: "Worker.swift",
      lineNumber: 99,
      address: "0xABCD",
      isBlameFrame: true,
      sampleCount: 42,
    });

    expect(result).toEqual({
      symbolName: "doWork",
      binaryName: "MyApp",
      fileName: "Worker.swift",
      lineNumber: 99,
      address: "0xABCD",
      isBlameFrame: true,
      sampleCount: 42,
    });
  });

  it("handles missing optional fields with defaults", () => {
    const result = parseCallStackFrame({});

    expect(result).toEqual({
      symbolName: "",
      binaryName: "",
      fileName: null,
      lineNumber: null,
      address: null,
      isBlameFrame: false,
      sampleCount: 0,
    });
  });

  it("omits subFrames key when empty", () => {
    const result = parseCallStackFrame({
      symbolName: "test",
      binaryName: "App",
      subFrames: [],
    });

    expect(result.subFrames).toBeUndefined();
  });

  it("includes subFrames when present", () => {
    const result = parseCallStackFrame({
      symbolName: "parent",
      binaryName: "App",
      sampleCount: 5,
      subFrames: [
        { symbolName: "child", binaryName: "App", sampleCount: 2 },
      ],
    });

    expect(result.subFrames).toHaveLength(1);
    expect(result.subFrames![0].symbolName).toBe("child");
  });
});
