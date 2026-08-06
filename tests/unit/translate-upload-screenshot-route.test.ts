import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateContent = vi.fn();
const mockGetGeminiKey = vi.fn();
const mockSaveGeminiKey = vi.fn();
const mockUploadScreenshot = vi.fn();
const mockCreateScreenshotSet = vi.fn();
const mockInvalidateScreenshotCache = vi.fn();
const mockListScreenshotSets = vi.fn();
const mockSharpMetadata = vi.fn();
const mockSharpToBuffer = vi.fn();
const mockLocaleName = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: (...args: unknown[]) => mockGenerateContent(...args),
    };
  },
}));

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    metadata: () => mockSharpMetadata(),
    resize: () => ({
      jpeg: () => ({
        toBuffer: () => mockSharpToBuffer(),
      }),
    }),
  })),
}));

vi.mock("@/lib/ai/gemini-key", () => ({
  getGeminiKey: () => mockGetGeminiKey(),
  saveGeminiKey: (...args: unknown[]) => mockSaveGeminiKey(...args),
}));

vi.mock("@/lib/asc/screenshot-mutations", () => ({
  uploadScreenshot: (...args: unknown[]) => mockUploadScreenshot(...args),
  createScreenshotSet: (...args: unknown[]) => mockCreateScreenshotSet(...args),
  invalidateScreenshotCache: (...args: unknown[]) => mockInvalidateScreenshotCache(...args),
}));

vi.mock("@/lib/asc/screenshots", () => ({
  listScreenshotSets: (...args: unknown[]) => mockListScreenshotSets(...args),
}));

vi.mock("@/lib/asc/locale-names", () => ({
  localeName: (...args: unknown[]) => mockLocaleName(...args),
}));

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageUrl: "https://is1-ssl.mzstatic.com/image.png",
      toLocale: "fr-FR",
      fileName: "screen.png",
      displayType: "APP_IPHONE_67",
      targetLocalizationId: "loc-1",
      ...body,
    }),
  });
}

describe("translate-and-upload-screenshot route", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockGetGeminiKey.mockReset();
    mockGetGeminiKey.mockResolvedValue("gemini-key");
    mockSaveGeminiKey.mockReset();
    mockUploadScreenshot.mockReset();
    mockUploadScreenshot.mockResolvedValue({ id: "shot-1" });
    mockCreateScreenshotSet.mockReset();
    mockCreateScreenshotSet.mockResolvedValue("set-new");
    mockInvalidateScreenshotCache.mockReset();
    mockListScreenshotSets.mockReset();
    mockListScreenshotSets.mockResolvedValue([
      { id: "set-existing", attributes: { screenshotDisplayType: "APP_IPHONE_67" } },
    ]);
    mockSharpMetadata.mockReset();
    mockSharpMetadata.mockResolvedValue({ width: 1200, height: 2600 });
    mockSharpToBuffer.mockReset();
    mockSharpToBuffer.mockResolvedValue(Buffer.from("processed"));
    mockLocaleName.mockReset();
    mockLocaleName.mockReturnValue("French");
    vi.stubGlobal("fetch", vi.fn());
    vi.resetModules();
  });

  it("rejects non-Apple CDN urls", async () => {
    const { POST } = await import("@/app/api/ai/translate-and-upload-screenshot/route");

    const response = await POST(
      makeRequest({ imageUrl: "https://example.com/image.png" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid image URL" });
  });

  it("returns 502 when the Apple CDN image cannot be fetched", async () => {
    const { POST } = await import("@/app/api/ai/translate-and-upload-screenshot/route");
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    const response = await POST(makeRequest({ copyOnly: true }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Failed to fetch screenshot from Apple CDN",
    });
  });

  it("requires a Gemini key for translation mode", async () => {
    const { POST } = await import("@/app/api/ai/translate-and-upload-screenshot/route");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(Buffer.from("image-bytes"), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    mockGetGeminiKey.mockResolvedValue(null);

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "gemini_key_required" });
  });

  it("saves a provided Gemini key and uploads the original image in copy-only mode", async () => {
    const { POST } = await import("@/app/api/ai/translate-and-upload-screenshot/route");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(Buffer.from("image-bytes"), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }),
    );

    const response = await POST(
      makeRequest({ copyOnly: true, geminiKey: "new-key", targetSetId: "set-1" }),
    );

    expect(mockSaveGeminiKey).toHaveBeenCalledWith("new-key");
    expect(mockUploadScreenshot).toHaveBeenCalledWith(
      "set-1",
      "screen_fr-FR.jpg",
      expect.any(Buffer),
    );
    expect(mockInvalidateScreenshotCache).toHaveBeenCalledWith("loc-1");
    expect(await response.json()).toEqual({
      screenshotId: "shot-1",
      targetSetId: "set-1",
      thumbnail: Buffer.from("processed").toString("base64"),
      thumbnailMimeType: "image/jpeg",
    });
  });

  it("returns 502 when Gemini returns no candidates", async () => {
    const { POST } = await import("@/app/api/ai/translate-and-upload-screenshot/route");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(Buffer.from("image-bytes"), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    mockGenerateContent.mockResolvedValue({ candidates: [] });

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "No response from Gemini" });
  });

  it("returns 422 when Gemini does not return an image", async () => {
    const { POST } = await import("@/app/api/ai/translate-and-upload-screenshot/route");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(Buffer.from("image-bytes"), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    mockGenerateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: "No image here" }] } }],
    });

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("Gemini did not return an image");
  });

  it("maps Gemini auth failures to gemini_auth_error", async () => {
    const { POST } = await import("@/app/api/ai/translate-and-upload-screenshot/route");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(Buffer.from("image-bytes"), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    mockGenerateContent.mockRejectedValue(new Error("401 Unauthorized"));

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "gemini_auth_error" });
  });

  it("returns 500 when screenshot set lookup/creation fails", async () => {
    const { POST } = await import("@/app/api/ai/translate-and-upload-screenshot/route");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(Buffer.from("image-bytes"), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    mockListScreenshotSets.mockRejectedValue(new Error("ASC down"));
    mockGenerateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from("gemini").toString("base64") } }] } }],
    });

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Failed to create screenshot set in target locale",
    });
  });

  it("returns 500 when screenshot upload fails", async () => {
    const { POST } = await import("@/app/api/ai/translate-and-upload-screenshot/route");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(Buffer.from("image-bytes"), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    mockUploadScreenshot.mockRejectedValue(new Error("upload failed"));
    mockGenerateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from("gemini").toString("base64") } }] } }],
    });

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Screenshot upload failed: upload failed",
    });
  });

  it("translates, creates a screenshot set when needed, uploads, and returns a thumbnail", async () => {
    const { POST } = await import("@/app/api/ai/translate-and-upload-screenshot/route");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(Buffer.from("image-bytes"), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    mockListScreenshotSets.mockResolvedValue([]);
    mockGenerateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from("gemini").toString("base64") } }] } }],
    });

    const response = await POST(makeRequest({ toLocale: "ar-SA", marketingOnly: false }));

    expect(mockLocaleName).toHaveBeenCalledWith("ar-SA");
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-3-pro-image",
        contents: [
          expect.objectContaining({
            parts: [
              expect.objectContaining({
                text: expect.stringContaining("right-to-left"),
              }),
              expect.any(Object),
            ],
          }),
        ],
      }),
    );
    expect(mockCreateScreenshotSet).toHaveBeenCalledWith("loc-1", "APP_IPHONE_67");
    expect(mockUploadScreenshot).toHaveBeenCalledWith(
      "set-new",
      "screen_ar-SA.jpg",
      expect.any(Buffer),
    );
    expect(await response.json()).toEqual({
      screenshotId: "shot-1",
      targetSetId: "set-new",
      thumbnail: Buffer.from("processed").toString("base64"),
      thumbnailMimeType: "image/jpeg",
    });
  });

  it("returns 500 with message when Gemini throws a non-auth error", async () => {
    const { POST } = await import("@/app/api/ai/translate-and-upload-screenshot/route");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(Buffer.from("image-bytes"), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    mockGenerateContent.mockRejectedValue(new Error("Rate limit exceeded"));

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Screenshot translation failed: Rate limit exceeded",
    });
  });
});
