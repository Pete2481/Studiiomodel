import { NextRequest, NextResponse } from "next/server";
import { getGalleryAssets } from "@/app/actions/storage";

/**
 * Lightweight change check for Gallery V2.
 * Returns a deterministic "signature" for the first page in name order.
 *
 * Used on:
 * - open (optional)
 * - tab regains focus (visibilitychange)
 *
 * IMPORTANT: We intentionally do NOT auto-apply changes client-side because it can reshuffle
 * already-loaded pages. The client should show a "Refresh available" toast instead.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ galleryId: string }> },
) {
  try {
    const { galleryId } = await params;
    const { searchParams } = new URL(req.url);
    const limit = Math.max(1, Math.min(64, Number(searchParams.get("limit") || "16")));

    const res = await getGalleryAssets(galleryId, limit);
    if (!res?.success) {
      const msg = String(res?.error || "Failed to fetch assets");
      const code =
        msg.toLowerCase().includes("dropbox not connected")
          ? "DROPBOX_NOT_CONNECTED"
          : msg.toLowerCase().includes("gallery not found")
            ? "GALLERY_NOT_FOUND"
            : "ASSET_FETCH_FAILED";
      return NextResponse.json({ success: false, error: msg, code }, { status: 200 });
    }

    const assets = Array.isArray(res.assets) ? res.assets : [];
    const signature = assets
      .slice(0, limit)
      .map((a: any) => String(a?.id || a?.name || a?.path || a?.url || ""))
      .join("|");

    return NextResponse.json({
      success: true,
      limit,
      signature,
      nextCursor: res.nextCursor || null,
      ts: Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: String(e?.message || "Failed to check changes"), code: "INTERNAL_ERROR" },
      { status: 200 },
    );
  }
}


