import { NextResponse } from "next/server";
import { listLocalizations } from "@/lib/asc/localizations";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import {
  updateVersionLocalization,
  createVersionLocalization,
  deleteVersionLocalization,
  invalidateLocalizationsCache,
} from "@/lib/asc/localization-mutations";
import { errorJson } from "@/lib/api-helpers";


export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string; versionId: string }> },
) {
  const { versionId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ localizations: [], meta: null });
  }

  try {
    const localizations = await listLocalizations(versionId);
    const meta = cacheGetMeta(`localizations:${versionId}`);

    return NextResponse.json({ localizations, meta });
  } catch (err) {
    return errorJson(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ appId: string; versionId: string }> },
) {
  const { versionId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No credentials" }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      locales: Record<string, Record<string, unknown>>;
      originalLocaleIds: Record<string, string>;
    };

    const { locales, originalLocaleIds } = body;
    const errors: string[] = [];
    const createdIds: Record<string, string> = {};

    // Diff: update, create, delete
    const updates: Promise<void>[] = [];

    for (const [locale, fields] of Object.entries(locales)) {
      const existingId = originalLocaleIds[locale];
      if (existingId) {
        updates.push(
          updateVersionLocalization(existingId, fields).catch((err) => {
            errors.push(`Update ${locale}: ${err instanceof Error ? err.message : "failed"}`);
          }),
        );
      } else {
        updates.push(
          createVersionLocalization(versionId, locale, fields).then((id) => {
            createdIds[locale] = id;
          }).catch((err) => {
            errors.push(`Create ${locale}: ${err instanceof Error ? err.message : "failed"}`);
          }),
        );
      }
    }

    for (const [locale, locId] of Object.entries(originalLocaleIds)) {
      if (!locales[locale]) {
        updates.push(
          deleteVersionLocalization(locId).catch((err) => {
            errors.push(`Delete ${locale}: ${err instanceof Error ? err.message : "failed"}`);
          }),
        );
      }
    }

    await Promise.allSettled(updates);

    invalidateLocalizationsCache(versionId);

    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors, createdIds }, { status: 207 });
    }

    return NextResponse.json({ ok: true, errors: [], createdIds });
  } catch (err) {
    return errorJson(err, 500);
  }
}
