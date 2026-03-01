import { NextResponse } from "next/server";
import type { z } from "zod";

/**
 * Build an error JSON response from a caught value.
 * Extracts the message from Error instances, falls back to a default string.
 */
export function errorJson(err: unknown, status = 502, fallback = "Unknown error"): NextResponse {
  const message = err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

/**
 * Parse a JSON request body and validate it against a Zod schema.
 * Returns either the parsed data or an error Response (400).
 */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T | Response> {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  return parsed.data;
}
