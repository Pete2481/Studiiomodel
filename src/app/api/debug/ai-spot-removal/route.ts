import { NextResponse } from "next/server";
import sharp from "sharp";
import { processImageWithAI } from "@/app/actions/ai-edit";

export const runtime = "nodejs";

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export async function GET() {
  // Dev-only safety (do not expose a Replicate-costing endpoint in production).
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // Generate a non-uniform synthetic image so we can detect changes.
    // Background is a subtle gradient + the "object" is a red square.
    const W = 256;
    const H = 256;
    const raw = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = clamp01((x + y) / (W + H));
        const base = 170 + Math.round(t * 40); // 170..210
        const idx = (y * W + x) * 3;
        raw[idx + 0] = base;
        raw[idx + 1] = base;
        raw[idx + 2] = base;
      }
    }
    // Place a red square object in the center.
    for (let y = 88; y < 168; y++) {
      for (let x = 88; x < 168; x++) {
        const idx = (y * W + x) * 3;
        raw[idx + 0] = 220;
        raw[idx + 1] = 40;
        raw[idx + 2] = 40;
      }
    }
    const imgBuf = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();

    // Mask exactly covers the red square (white=remove).
    // Intentionally create the mask at a DIFFERENT resolution to simulate the UI (mask drawn on a scaled image).
    const MW = 160;
    const MH = 160;
    const maskRaw = Buffer.alloc(MW * MH * 3, 0);
    // Square in the center of the smaller mask
    for (let y = 40; y < 120; y++) {
      for (let x = 40; x < 120; x++) {
        const idx = (y * MW + x) * 3;
        maskRaw[idx + 0] = 255;
        maskRaw[idx + 1] = 255;
        maskRaw[idx + 2] = 255;
      }
    }
    const maskBuf = await sharp(maskRaw, { raw: { width: MW, height: MH, channels: 3 } }).png().toBuffer();

    const imgData = `data:image/png;base64,${imgBuf.toString("base64")}`;
    const maskData = `data:image/png;base64,${maskBuf.toString("base64")}`;

    const res = await processImageWithAI(imgData, "object_removal", undefined, undefined, "debug", maskData);
    if (!res.success || !res.outputUrl) {
      return NextResponse.json({ success: false, error: res.error || "Failed to run spot removal test" }, { status: 500 });
    }

    // Compute a simple pixel diff vs original to prove the result changed.
    const outBytes = await (async () => {
      const outUrl = String(res.outputUrl);
      if (outUrl.startsWith("data:")) return Buffer.from(outUrl.split(",")[1], "base64");
      const r = await fetch(outUrl);
      if (!r.ok) throw new Error(`Failed to fetch output (${r.status})`);
      return Buffer.from(await r.arrayBuffer());
    })();
    const outRaw = await sharp(outBytes).resize(W, H).raw().toBuffer();
    const origRaw = await sharp(imgBuf).raw().toBuffer();
    let sum = 0;
    for (let i = 0; i < outRaw.length; i++) sum += Math.abs(outRaw[i] - origRaw[i]);
    const meanAbsDiff = sum / outRaw.length;
    return NextResponse.json({ success: true, outputUrl: String(res.outputUrl), meanAbsDiff });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to run spot removal test" },
      { status: 500 }
    );
  }
}

