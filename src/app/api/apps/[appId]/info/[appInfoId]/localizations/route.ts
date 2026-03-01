import { NextResponse } from "next/server";
import { listAppInfoLocalizations } from "@/lib/asc/app-info";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import {
  updateAppInfoLocalization,
  createAppInfoLocalization,
  deleteAppInfoLocalization,
  invalidateAppInfoLocalizationsCache,
} from "@/lib/asc/localization-mutations";
import { errorJson } from "@/lib/api-helpers";


export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string; appInfoId: string }> },
) {
  const { appInfoId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ localizations: [], meta: null });
  }

  try {
    const localizations = await listAppInfoLocalizations(appInfoId);
    const meta = cacheGetMeta(`appInfoLocalizations:${appInfoId}`);

    return NextResponse.json({ localizations, meta });
  } catch (err) {
    return errorJson(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ appId: string; appInfoId: string }> },
) {
  const { appInfoId } = await params;

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

    const updates: Promise<void>[] = [];

    for (const [locale, fields] of Object.entries(locales)) {
      const existingId = originalLocaleIds[locale];
      if (existingId) {
        updates.push(
          updateAppInfoLocalization(existingId, fields).catch((err) => {
            errors.push(`Update ${locale}: ${err instanceof Error ? err.message : "failed"}`);
          }),
        );
      } else {
        updates.push(
          createAppInfoLocalization(appInfoId, locale, fields).then((id) => {
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
          deleteAppInfoLocalization(locId).catch((err) => {
            errors.push(`Delete ${locale}: ${err instanceof Error ? err.message : "failed"}`);
          }),
        );
      }
    }

    await Promise.allSettled(updates);

    invalidateAppInfoLocalizationsCache(appInfoId);

    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors, createdIds }, { status: 207 });
    }

    return NextResponse.json({ ok: true, errors: [], createdIds });
  } catch (err) {
    return errorJson(err, 500);
  }
}
