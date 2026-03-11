import { NextResponse } from "next/server";
import type { z } from "zod";
import { AscApiError } from "@/lib/asc/client";
import type { AscErrorEntry } from "@/lib/asc/errors";

/**
 * Build an error JSON response from a caught value.
 * For AscApiError, includes category, ascErrors, ascMethod, and ascPath
 * so the client can show structured error details.
 */
export function errorJson(err: unknown, status = 502, fallback = "Unknown error"): NextResponse {
  if (err instanceof AscApiError) {
    const { message, category, statusCode, entries, method, path, associatedErrors } = err.ascError;
    return NextResponse.json(
      {
        error: message,
        category,
        statusCode,
        ...(entries && { ascErrors: entries }),
        ...(method && { ascMethod: method }),
        ...(path && { ascPath: path }),
        ...(associatedErrors && { ascAssociatedErrors: associatedErrors }),
      },
      { status: statusCode ?? status },
    );
  }

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

export interface SyncError {
  operation: "update" | "create" | "delete";
  locale: string;
  message: string;
  ascErrors?: AscErrorEntry[];
  ascMethod?: string;
  ascPath?: string;
}

export interface SyncLocalizationsMutations {
  update: (id: string, fields: Record<string, unknown>) => Promise<void>;
  create: (parentId: string, locale: string, fields: Record<string, unknown>) => Promise<string>;
  delete: (id: string) => Promise<void>;
  invalidateCache: () => void;
}

/**
 * Sync localizations: update existing, create new, delete removed.
 * Used by version, app info, and TestFlight localization PUT handlers.
 */
export async function syncLocalizations(
  request: Request,
  parentId: string,
  mutations: SyncLocalizationsMutations,
): Promise<NextResponse> {
  const body = await request.json() as {
    locales: Record<string, Record<string, unknown>>;
    originalLocaleIds: Record<string, string>;
  };

  const { locales, originalLocaleIds } = body;
  const errors: SyncError[] = [];
  const createdIds: Record<string, string> = {};
  const ops: Promise<void>[] = [];

  console.log("[syncLocalizations] parentId=%s locales=%s existing=%s", parentId, Object.keys(locales).join(","), Object.keys(originalLocaleIds).join(","));

  for (const [locale, fields] of Object.entries(locales)) {
    const existingId = originalLocaleIds[locale];
    if (existingId) {
      console.log("[syncLocalizations] update locale=%s id=%s fields=%s", locale, existingId, Object.keys(fields).join(","));
      ops.push(
        mutations.update(existingId, fields).catch((err) => {
          const syncErr: SyncError = {
            operation: "update",
            locale,
            message: err instanceof Error ? err.message : "failed",
          };
          if (err instanceof AscApiError) {
            syncErr.ascErrors = err.ascError.entries;
            syncErr.ascMethod = err.ascError.method;
            syncErr.ascPath = err.ascError.path;
          }
          errors.push(syncErr);
        }),
      );
    } else {
      console.log("[syncLocalizations] create locale=%s fields=%s", locale, Object.keys(fields).join(","));
      ops.push(
        mutations.create(parentId, locale, fields).then((id) => {
          console.log("[syncLocalizations] created locale=%s id=%s", locale, id);
          createdIds[locale] = id;
        }).catch((err) => {
          const syncErr: SyncError = {
            operation: "create",
            locale,
            message: err instanceof Error ? err.message : "failed",
          };
          if (err instanceof AscApiError) {
            syncErr.ascErrors = err.ascError.entries;
            syncErr.ascMethod = err.ascError.method;
            syncErr.ascPath = err.ascError.path;
          }
          errors.push(syncErr);
        }),
      );
    }
  }

  for (const [locale, locId] of Object.entries(originalLocaleIds)) {
    if (!locales[locale]) {
      ops.push(
        mutations.delete(locId).catch((err) => {
          const syncErr: SyncError = {
            operation: "delete",
            locale,
            message: err instanceof Error ? err.message : "failed",
          };
          if (err instanceof AscApiError) {
            syncErr.ascErrors = err.ascError.entries;
            syncErr.ascMethod = err.ascError.method;
            syncErr.ascPath = err.ascError.path;
          }
          errors.push(syncErr);
        }),
      );
    }
  }

  await Promise.allSettled(ops);
  console.log("[syncLocalizations] all ops settled, errors=%d created=%s", errors.length, Object.keys(createdIds).join(","));
  mutations.invalidateCache();

  if (errors.length > 0) {
    console.log("[syncLocalizations] returning 207 with errors:", JSON.stringify(errors));
    return NextResponse.json({ ok: false, errors, createdIds }, { status: 207 });
  }

  return NextResponse.json({ ok: true, errors: [], createdIds });
}
