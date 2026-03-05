import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureLocalModelLoaded,
  normalizeOpenAICompatibleBaseUrl,
  resetLocalModelLoadStateForTests,
  resolveLocalOpenAIBaseUrl,
} from "@/lib/ai/local-provider";

describe("normalizeOpenAICompatibleBaseUrl", () => {
  it("adds /v1 when missing", () => {
    expect(normalizeOpenAICompatibleBaseUrl("http://127.0.0.1:1234")).toBe(
      "http://127.0.0.1:1234/v1",
    );
  });

  it("normalizes chat completions URLs to /v1", () => {
    expect(
      normalizeOpenAICompatibleBaseUrl("http://127.0.0.1:1234/v1/chat/completions"),
    ).toBe("http://127.0.0.1:1234/v1");
  });

  it("returns null for invalid urls", () => {
    expect(normalizeOpenAICompatibleBaseUrl("not a url")).toBeNull();
  });
});

describe("resolveLocalOpenAIBaseUrl", () => {
  it("falls back to default when invalid", () => {
    expect(resolveLocalOpenAIBaseUrl("bad url")).toBe("http://127.0.0.1:1234/v1");
  });
});

describe("ensureLocalModelLoaded", () => {
  afterEach(() => {
    resetLocalModelLoadStateForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null when model load succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded(
      "zai-org/glm-4.7-flash",
      "http://127.0.0.1:1234/v1",
      undefined,
    );

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:1234/api/v1/models");
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit)?.method).toBe("GET");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://127.0.0.1:1234/api/v1/models/load");
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit)?.method).toBe("POST");
  });

  it("skips load when selected model is already loaded", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(
        JSON.stringify({
          models: [
            { key: "gemma-3", loaded_instances: [{ id: "gemma-3" }] },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:1234/api/v1/models");
  });

  it("returns null when load endpoint is unsupported", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded(
      "zai-org/glm-4.7-flash",
      "http://127.0.0.1:1234/v1",
      undefined,
    );

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces model-not-found errors returned as 404", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { type: "model_not_found", message: "Model missing" } }),
          { status: 404 },
        ),
      );
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    const result = await ensureLocalModelLoaded(
      "missing-model",
      "http://127.0.0.1:1234/v1",
      undefined,
    );

    expect(result).toBe("Model missing");
  });

  it("returns server error message on load failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "insufficient system resources" } }),
          { status: 500 },
        ),
      );
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    const result = await ensureLocalModelLoaded(
      "devstral-small-2507-mlx",
      "http://127.0.0.1:1234/v1",
      undefined,
    );

    expect(result).toContain("insufficient system resources");
  });

  it("returns network errors", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/models")) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      throw new Error("connection refused");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureLocalModelLoaded(
      "zai-org/glm-4.7-flash",
      "http://127.0.0.1:1234/v1",
      undefined,
    );

    expect(result).toContain("Could not switch local model");
  });

  it("coalesces concurrent loads for same server+model", async () => {
    let resolveLoad: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/models")) {
        return Promise.resolve(new Response(JSON.stringify({ models: [] }), { status: 200 }));
      }
      return new Promise<Response>((resolve) => {
        resolveLoad = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    const second = ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const loadCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith("/api/v1/models/load"),
    );
    expect(loadCalls).toHaveLength(1);

    resolveLoad?.(new Response("{}", { status: 200 }));
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBeNull();
    expect(secondResult).toBeNull();
  });

  it("skips repeated loads for same model within throttle window", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    const second = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches unsupported load endpoint per server", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    const second = await ensureLocalModelLoaded("glm-4.7-flash", "http://127.0.0.1:1234/v1", undefined);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches unsupported model-list endpoint per server", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await ensureLocalModelLoaded("gemma-3", "http://127.0.0.1:1234/v1", undefined);
    const second = await ensureLocalModelLoaded("glm-4.7-flash", "http://127.0.0.1:1234/v1", undefined);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:1234/api/v1/models");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://127.0.0.1:1234/api/v1/models/load");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("http://127.0.0.1:1234/api/v1/models/load");
  });
});
