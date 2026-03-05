import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api-helpers";
import {
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  normalizeOpenAICompatibleBaseUrl,
} from "@/lib/ai/local-provider";

const requestSchema = z.object({
  baseUrl: z.string().trim().optional(),
  apiKey: z.string().trim().optional(),
});

export async function POST(request: Request) {
  const parsed = await parseBody(request, requestSchema);
  if (parsed instanceof Response) return parsed;

  const requestedBaseUrl = parsed.baseUrl?.trim();
  const normalizedBaseUrl = requestedBaseUrl
    ? normalizeOpenAICompatibleBaseUrl(requestedBaseUrl)
    : DEFAULT_LOCAL_OPENAI_BASE_URL;

  if (!normalizedBaseUrl) {
    return NextResponse.json({ error: "Invalid local server URL" }, { status: 400 });
  }

  const apiKey = parsed.apiKey?.trim();
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;

  try {
    const res = await fetch(`${normalizedBaseUrl}/models`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    const raw = await res.text();
    const payload = raw ? JSON.parse(raw) as { data?: Array<{ id?: string }> } : {};

    if (!res.ok) {
      const message =
        (payload as { error?: { message?: string } }).error?.message ||
        `Model lookup failed with status ${res.status}`;
      return NextResponse.json({ error: message }, { status: 422 });
    }

    const models = Array.isArray(payload.data)
      ? payload.data
          .map((entry) => entry.id)
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [];

    return NextResponse.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Could not reach local server: ${message}` },
      { status: 422 },
    );
  }
}
