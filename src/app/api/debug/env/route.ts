import { NextResponse } from "next/server";

/**
 * Local-only debug endpoint to verify env loading.
 * Do NOT expose sensitive values here.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const raw = process.env.NEXT_PUBLIC_GALLERY_V2_ENABLED;
  return NextResponse.json({
    ok: true,
    nodeEnv: process.env.NODE_ENV,
    NEXT_PUBLIC_GALLERY_V2_ENABLED: raw ?? null,
  });
}


