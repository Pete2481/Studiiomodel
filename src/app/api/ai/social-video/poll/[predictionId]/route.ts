import { NextRequest, NextResponse } from "next/server";
import { pollAiSocialVideo } from "@/app/actions/ai-video";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ predictionId: string }> }
) {
  try {
    const { predictionId } = await props.params;
    const url = new URL(req.url);
    const galleryId = String(url.searchParams.get("galleryId") || "");

    const result = await pollAiSocialVideo({ predictionId: String(predictionId || ""), galleryId });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}


