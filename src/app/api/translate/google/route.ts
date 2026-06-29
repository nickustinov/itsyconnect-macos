import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { text } = await request.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const { default: translate } = await import("google-translate-api-x");
    const res = await translate(text, { to: "en" });
    return NextResponse.json({ result: res.text });
  } catch (err) {
    console.error("[translate/google] error:", err);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 },
    );
  }
}
