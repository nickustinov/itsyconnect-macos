import { NextResponse } from "next/server";
import { z } from "zod";
import { errorJson } from "@/lib/api-helpers";
import {
  getBetaAppInfo,
  createBetaAppLocalization,
  deleteBetaAppLocalization,
  updateBetaAppLocalization,
  updateBetaAppReviewDetail,
  updateBetaLicenseAgreement,
} from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta, cacheInvalidatePrefix } from "@/lib/cache";
import { getMockBetaAppInfo } from "@/lib/mock-testflight";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (!hasCredentials()) {
    const info = getMockBetaAppInfo(appId);
    return NextResponse.json({ info, meta: null });
  }

  try {
    const info = await getBetaAppInfo(appId, forceRefresh);
    const meta = cacheGetMeta(`tf-info:${appId}`);
    return NextResponse.json({ info, meta });
  } catch (err) {
    return errorJson(err);
  }
}

const localizationSchema = z.object({
  action: z.literal("updateLocalization"),
  localizationId: z.string().min(1),
  fields: z.object({
    description: z.string().max(4000).optional(),
    feedbackEmail: z.string().optional(),
    marketingUrl: z.string().optional(),
    privacyPolicyUrl: z.string().optional(),
  }),
});

const reviewDetailSchema = z.object({
  action: z.literal("updateReviewDetail"),
  detailId: z.string().min(1),
  fields: z.object({
    contactFirstName: z.string().optional(),
    contactLastName: z.string().optional(),
    contactPhone: z.string().optional(),
    contactEmail: z.string().optional(),
    demoAccountRequired: z.boolean().optional(),
    demoAccountName: z.string().optional(),
    demoAccountPassword: z.string().optional(),
    notes: z.string().max(4000).optional(),
  }),
});

const licenseSchema = z.object({
  action: z.literal("updateLicense"),
  agreementId: z.string().min(1),
  agreementText: z.string(),
});

const patchSchema = z.discriminatedUnion("action", [
  localizationSchema,
  reviewDetailSchema,
  licenseSchema,
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  await params;

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No ASC credentials" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.action === "updateLocalization") {
      await updateBetaAppLocalization(parsed.data.localizationId, parsed.data.fields);
      return NextResponse.json({ ok: true });
    }

    if (parsed.data.action === "updateReviewDetail") {
      await updateBetaAppReviewDetail(parsed.data.detailId, parsed.data.fields);
      return NextResponse.json({ ok: true });
    }

    // updateLicense
    await updateBetaLicenseAgreement(parsed.data.agreementId, parsed.data.agreementText);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No ASC credentials" }, { status: 401 });
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
        // Update existing locale
        updates.push(
          updateBetaAppLocalization(existingId, fields as Parameters<typeof updateBetaAppLocalization>[1]).catch((err) => {
            errors.push(`Update ${locale}: ${err instanceof Error ? err.message : "failed"}`);
          }),
        );
      } else {
        // Create new locale
        updates.push(
          createBetaAppLocalization(appId, locale, fields).then((id) => {
            createdIds[locale] = id;
          }).catch((err) => {
            errors.push(`Create ${locale}: ${err instanceof Error ? err.message : "failed"}`);
          }),
        );
      }
    }

    // Delete removed locales
    for (const [locale, locId] of Object.entries(originalLocaleIds)) {
      if (!locales[locale]) {
        updates.push(
          deleteBetaAppLocalization(locId).catch((err) => {
            errors.push(`Delete ${locale}: ${err instanceof Error ? err.message : "failed"}`);
          }),
        );
      }
    }

    await Promise.allSettled(updates);

    cacheInvalidatePrefix("tf-info:");

    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors, createdIds }, { status: 207 });
    }

    return NextResponse.json({ ok: true, errors: [], createdIds });
  } catch (err) {
    return errorJson(err, 500);
  }
}
