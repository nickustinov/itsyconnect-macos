import { NextResponse } from "next/server";
import { errorJson } from "@/lib/api-helpers";
import { getGroupDetail, deleteGroup } from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import { getMockGroupDetail } from "@/lib/mock-testflight";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string; groupId: string }> },
) {
  const { appId, groupId } = await params;
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  void appId; // groupId is sufficient for fetching

  if (!hasCredentials()) {
    const detail = getMockGroupDetail(groupId);
    if (!detail) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    return NextResponse.json({ ...detail, meta: null });
  }

  try {
    const detail = await getGroupDetail(groupId, forceRefresh);
    if (!detail) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    const meta = cacheGetMeta(`tf-group:${groupId}`);
    return NextResponse.json({ ...detail, meta });
  } catch (err) {
    return errorJson(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ appId: string; groupId: string }> },
) {
  const { groupId } = await params;

  if (!hasCredentials()) {
    return NextResponse.json({ ok: true });
  }

  try {
    await deleteGroup(groupId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
