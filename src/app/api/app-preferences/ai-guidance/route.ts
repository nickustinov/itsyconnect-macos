import { NextResponse } from "next/server";
import { z } from "zod";
import { getAIGuidance, setAIGuidance } from "@/lib/app-preferences";
import { parseBody } from "@/lib/api-helpers";

const scopeSchema = z.enum(["translation", "reviews"]);

export async function GET(request: Request) {
  const scope = scopeSchema.catch("translation").parse(
    new URL(request.url).searchParams.get("scope"),
  );
  return NextResponse.json({ scope, guidance: getAIGuidance(scope) });
}

const updateSchema = z.object({
  scope: scopeSchema,
  guidance: z.string().max(2000, "Guidance must be 2000 characters or fewer"),
});

export async function PUT(request: Request) {
  const parsed = await parseBody(request, updateSchema);
  if (parsed instanceof Response) return parsed;

  const guidance = parsed.guidance.trim();
  setAIGuidance(parsed.scope, guidance);
  return NextResponse.json({ scope: parsed.scope, guidance });
}
