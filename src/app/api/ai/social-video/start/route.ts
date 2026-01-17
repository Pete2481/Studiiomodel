import { NextRequest, NextResponse } from "next/server";
import { startAiSocialVideo } from "@/app/actions/ai-video";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const galleryId = String(body?.galleryId || "");
    const orderedAssets = Array.isArray(body?.orderedAssets) ? body.orderedAssets : [];
    const durationSecondsRaw = body?.durationSeconds;
    const durationSeconds = durationSecondsRaw === 5 || durationSecondsRaw === "5" ? 5 : 10;

    const result = await startAiSocialVideo({ galleryId, orderedAssets, durationSeconds });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}


