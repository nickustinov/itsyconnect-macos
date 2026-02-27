import { createHash } from "node:crypto";
import { ascFetch } from "./client";
import { cacheInvalidate } from "@/lib/cache";
import type { AscScreenshot } from "./screenshots";

interface UploadOperation {
  method: string;
  url: string;
  length: number;
  offset: number;
  requestHeaders: Array<{ name: string; value: string }>;
}

interface ReserveResponse {
  data: {
    id: string;
    type: string;
    attributes: AscScreenshot["attributes"] & {
      uploadOperations: UploadOperation[];
    };
  };
}

interface ScreenshotResponse {
  data: {
    id: string;
    type: string;
    attributes: AscScreenshot["attributes"];
  };
}

/**
 * Full 3-step screenshot upload:
 * 1. POST reserve – gets id + uploadOperations[]
 * 2. PUT binary to each pre-signed URL
 * 3. PATCH commit with MD5 checksum
 */
export async function uploadScreenshot(
  setId: string,
  fileName: string,
  fileBuffer: Buffer,
): Promise<AscScreenshot> {
  // Step 1: Reserve
  const reserve = await ascFetch<ReserveResponse>("/v1/appScreenshots", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appScreenshots",
        attributes: {
          fileName,
          fileSize: fileBuffer.length,
        },
        relationships: {
          appScreenshotSet: {
            data: { type: "appScreenshotSets", id: setId },
          },
        },
      },
    }),
  });

  const screenshotId = reserve.data.id;
  const operations = reserve.data.attributes.uploadOperations;

  // Step 2: Upload binary to each pre-signed URL
  for (const op of operations) {
    const chunk = fileBuffer.subarray(op.offset, op.offset + op.length);
    const headers: Record<string, string> = {};
    for (const h of op.requestHeaders) {
      headers[h.name] = h.value;
    }

    const res = await fetch(op.url, {
      method: op.method,
      headers,
      body: new Blob([new Uint8Array(chunk)]),
    });

    if (!res.ok) {
      throw new Error(`Screenshot upload failed: ${res.status}`);
    }
  }

  // Step 3: Commit with MD5 checksum
  const md5 = createHash("md5").update(fileBuffer).digest("hex");
  const commit = await ascFetch<ScreenshotResponse>(
    `/v1/appScreenshots/${screenshotId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        data: {
          type: "appScreenshots",
          id: screenshotId,
          attributes: {
            sourceFileChecksum: md5,
            uploaded: true,
          },
        },
      }),
    },
  );

  return {
    id: commit.data.id,
    attributes: commit.data.attributes,
  };
}

/** Delete a single screenshot. */
export async function deleteScreenshot(screenshotId: string): Promise<void> {
  await ascFetch<null>(`/v1/appScreenshots/${screenshotId}`, {
    method: "DELETE",
  });
}

/** Reorder screenshots within a set. */
export async function reorderScreenshots(
  setId: string,
  screenshotIds: string[],
): Promise<void> {
  await ascFetch<null>(
    `/v1/appScreenshotSets/${setId}/relationships/appScreenshots`,
    {
      method: "PATCH",
      body: JSON.stringify({
        data: screenshotIds.map((id) => ({
          type: "appScreenshots",
          id,
        })),
      }),
    },
  );
}

/** Create a new screenshot set for a localization. */
export async function createScreenshotSet(
  localizationId: string,
  displayType: string,
): Promise<string> {
  const res = await ascFetch<{ data: { id: string } }>(
    "/v1/appScreenshotSets",
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "appScreenshotSets",
          attributes: {
            screenshotDisplayType: displayType,
          },
          relationships: {
            appStoreVersionLocalization: {
              data: {
                type: "appStoreVersionLocalizations",
                id: localizationId,
              },
            },
          },
        },
      }),
    },
  );
  return res.data.id;
}

/** Delete an empty screenshot set. */
export async function deleteScreenshotSet(setId: string): Promise<void> {
  await ascFetch<null>(`/v1/appScreenshotSets/${setId}`, {
    method: "DELETE",
  });
}

/** Invalidate the screenshot cache for a localization. */
export function invalidateScreenshotCache(localizationId: string): void {
  cacheInvalidate(`screenshotSets:${localizationId}`);
}
