import { NextResponse } from "next/server";
import { z } from "zod";
import { errorJson } from "@/lib/api-helpers";
import {
  listBuildIndividualTesters,
  listAppBetaTesters,
  addIndividualTestersToBuild,
  removeIndividualTestersFromBuild,
  createBetaTester,
  sendBetaTesterInvitations,
} from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";
import { getMockBuildTesters } from "@/lib/mock-testflight";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string; buildId: string }> },
) {
  const { appId, buildId } = await params;
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");

  if (!hasCredentials()) {
    const testers = getMockBuildTesters(buildId);
    return NextResponse.json({ testers });
  }

  try {
    // scope=app returns all app-level testers (for the "pick existing" dialog)
    const testers = scope === "app"
      ? await listAppBetaTesters(appId)
      : await listBuildIndividualTesters(buildId);
    return NextResponse.json({ testers });
  } catch (err) {
    return errorJson(err);
  }
}

const addExistingSchema = z.object({
  testerIds: z.array(z.string().min(1)).min(1),
});

const addNewSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string; buildId: string }> },
) {
  const { appId, buildId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ ok: true });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Try "add existing testers" first, then "create new tester"
  const existingParsed = addExistingSchema.safeParse(body);
  if (existingParsed.success) {
    try {
      const { testerIds } = existingParsed.data;
      await addIndividualTestersToBuild(buildId, testerIds);
      await sendBetaTesterInvitations(appId, testerIds);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorJson(err);
    }
  }

  const newParsed = addNewSchema.safeParse(body);
  if (newParsed.success) {
    try {
      const testerId = await createBetaTester(
        buildId,
        newParsed.data.email,
        newParsed.data.firstName,
        newParsed.data.lastName,
      );
      await sendBetaTesterInvitations(appId, [testerId]);
      return NextResponse.json({ ok: true, testerId });
    } catch (err) {
      return errorJson(err);
    }
  }

  return NextResponse.json(
    { error: "Validation failed: provide testerIds or email" },
    { status: 400 },
  );
}

const deleteSchema = z.object({
  testerIds: z.array(z.string().min(1)).min(1),
});

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ appId: string; buildId: string }> },
) {
  const { buildId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ ok: true });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await removeIndividualTestersFromBuild(buildId, parsed.data.testerIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
