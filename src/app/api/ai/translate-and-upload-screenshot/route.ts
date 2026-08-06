import { NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { getGeminiKey, saveGeminiKey } from "@/lib/ai/gemini-key";
import { parseBody } from "@/lib/api-helpers";
import { localeName } from "@/lib/asc/locale-names";
import { uploadScreenshot, createScreenshotSet, invalidateScreenshotCache } from "@/lib/asc/screenshot-mutations";
import { listScreenshotSets } from "@/lib/asc/screenshots";

const SCREENSHOT_MODEL = "gemini-3-pro-image";
const ALLOWED_HOST = "is1-ssl.mzstatic.com";
const THUMBNAIL_HEIGHT = 600;

const requestSchema = z.object({
  /** Apple CDN URL for the screenshot. */
  imageUrl: z.string().url(),
  /** Target locale code (e.g. "ru"). */
  toLocale: z.string(),
  /** Only translate marketing/overlay text, not app UI. */
  marketingOnly: z.boolean().default(true),
  /** Original file name of the screenshot. */
  fileName: z.string(),
  /** Display type of the screenshot set. */
  displayType: z.string(),
  /** Target localization ID for uploading. */
  targetLocalizationId: z.string(),
  /** Pre-resolved target set ID – skips the expensive listScreenshotSets lookup. */
  targetSetId: z.string().optional(),
  /** Whether to copy without translation (just upload original). */
  copyOnly: z.boolean().default(false),
  /** Optional: save a new Gemini API key before translating. */
  geminiKey: z.string().optional(),
});

export async function POST(request: Request) {
  console.log("[translate-and-upload] POST received");
  const parsed = await parseBody(request, requestSchema);
  if (parsed instanceof Response) return parsed;

  const {
    imageUrl, toLocale, marketingOnly, fileName,
    displayType, targetLocalizationId, targetSetId: preResolvedSetId,
    copyOnly, geminiKey,
  } = parsed;

  console.log(
    "[translate-and-upload] locale=%s displayType=%s copyOnly=%s file=%s",
    toLocale, displayType, copyOnly, fileName,
  );

  // Validate URL is from Apple CDN
  try {
    const url = new URL(imageUrl);
    if (url.hostname !== ALLOWED_HOST) {
      return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }

  // Save new key if provided
  if (geminiKey) {
    saveGeminiKey(geminiKey);
  }

  // Fetch the image from Apple CDN
  console.log("[translate-and-upload] Fetching image from CDN...");
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    return NextResponse.json(
      { error: "Failed to fetch screenshot from Apple CDN" },
      { status: 502 },
    );
  }

  const imgBuffer = await imgRes.arrayBuffer();
  const originalBuffer = Buffer.from(imgBuffer);
  const mimeType = imgRes.headers.get("content-type") ?? "image/png";

  let finalBuffer: Buffer;

  if (copyOnly) {
    // Just upload the original image
    finalBuffer = originalBuffer;
  } else {
    // Translate with Gemini
    const apiKey = geminiKey ?? await getGeminiKey();
    if (!apiKey) {
      return NextResponse.json({ error: "gemini_key_required" }, { status: 400 });
    }

    const imageBase64 = originalBuffer.toString("base64");
    const originalMeta = await sharp(originalBuffer).metadata();
    const origWidth = originalMeta.width!;
    const origHeight = originalMeta.height!;

    const targetLanguage = localeName(toLocale);
    const rtlLocales = new Set(["ar", "he", "fa", "ur"]);
    const langCode = toLocale.split("-")[0].toLowerCase();
    const isRtl = rtlLocales.has(langCode);
    const rtlNote = isRtl
      ? ` The target language is right-to-left (RTL). Ensure all translated text flows right-to-left and text alignment is adjusted accordingly.`
      : "";
    const prompt = marketingOnly
      ? `Translate marketing texts on the App Store Connect screenshot image to ${targetLanguage} preserving fonts and all other details. Do not translate UI of the app, only marketing texts.${rtlNote}`
      : `Translate all texts on the App Store Connect screenshot image to ${targetLanguage} preserving fonts and all other details.${rtlNote}`;

    console.log("[translate-and-upload] Calling Gemini...");
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: SCREENSHOT_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: imageBase64 } },
            ],
          },
        ],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { imageSize: "4K" },
        },
      });

      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) {
        return NextResponse.json({ error: "No response from Gemini" }, { status: 502 });
      }

      const parts = candidates[0].content?.parts ?? [];
      let geminiImageData: string | null = null;
      for (const part of parts) {
        if (part.inlineData?.data) {
          geminiImageData = part.inlineData.data;
          break;
        }
      }

      if (!geminiImageData) {
        const textParts = parts.filter((p) => p.text).map((p) => p.text).join(" ");
        return NextResponse.json(
          { error: `Gemini did not return an image. Response: ${textParts.slice(0, 200)}` },
          { status: 422 },
        );
      }

      // Resize to match original dimensions, always output JPEG to keep file size down
      // (PNG screenshots at retina res can be 8-15MB, JPEG at quality 92 is ~500KB-1MB)
      const geminiBuffer = Buffer.from(geminiImageData, "base64");
      finalBuffer = await sharp(geminiBuffer)
        .resize(origWidth, origHeight)
        .jpeg({ quality: 92 })
        .toBuffer();
      console.log("[translate-and-upload] Translated and resized: %d bytes (JPEG q92)", finalBuffer.length);
    } catch (err) {
      console.error("[translate-and-upload] Gemini error:", err);
      const message = err instanceof Error ? err.message : String(err);
      if (/401|unauthorized|invalid.*key|api.key/i.test(message)) {
        return NextResponse.json({ error: "gemini_auth_error" }, { status: 401 });
      }
      return NextResponse.json(
        { error: `Screenshot translation failed: ${message}` },
        { status: 500 },
      );
    }
  }

  // Find or create the target screenshot set
  let targetSetId = preResolvedSetId ?? null;
  if (targetSetId) {
    console.log("[translate-and-upload] Using cached targetSetId=%s", targetSetId);
  } else {
    console.log("[translate-and-upload] No targetSetId provided for displayType=%s, looking up...", displayType);
    try {
      const existingSets = await listScreenshotSets(targetLocalizationId);
      const existing = existingSets.find(
        (s) => s.attributes.screenshotDisplayType === displayType,
      );
      if (existing) {
        targetSetId = existing.id;
      } else {
        targetSetId = await createScreenshotSet(targetLocalizationId, displayType);
      }
    } catch (err) {
      console.error("[translate-and-upload] Failed to get/create set:", err);
      return NextResponse.json(
        { error: "Failed to create screenshot set in target locale" },
        { status: 500 },
      );
    }
  }

  // Upload to ASC
  console.log("[translate-and-upload] Uploading to ASC set=%s...", targetSetId);
  try {
    // Translated images are always JPEG; copies keep original format
    const ext = copyOnly ? (mimeType === "image/jpeg" ? ".jpg" : ".png") : ".jpg";
    const uploadName = fileName.replace(/\.[^.]+$/, "") + `_${toLocale}${ext}`;
    const screenshot = await uploadScreenshot(targetSetId, uploadName, finalBuffer);
    invalidateScreenshotCache(targetLocalizationId);

    // Generate a small thumbnail for the client
    const thumbBuffer = await sharp(finalBuffer)
      .resize({ height: THUMBNAIL_HEIGHT, withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    console.log("[translate-and-upload] Done! screenshotId=%s", screenshot.id);
    return NextResponse.json({
      screenshotId: screenshot.id,
      targetSetId,
      thumbnail: thumbBuffer.toString("base64"),
      thumbnailMimeType: "image/jpeg",
    });
  } catch (err) {
    console.error("[translate-and-upload] Upload error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Screenshot upload failed: ${message}` },
      { status: 500 },
    );
  }
}
