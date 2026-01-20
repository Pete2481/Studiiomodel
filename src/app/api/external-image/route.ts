import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

// Simple allowlist for security. Extend as needed.
const ALLOWLIST_HOSTS = new Set<string>([
  "replicate.delivery",
  "pbxt.replicate.delivery",
]);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    const profile = (searchParams.get("profile") || "").toLowerCase();
    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }

    if (!ALLOWLIST_HOSTS.has(parsed.hostname)) {
      return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
    }

    const upstream = await fetch(parsed.toString(), {
      // Avoid caching surprises during dev; allow browser caching.
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const sourceBytes = Buffer.from(arrayBuffer);
    const asArrayBuffer = (b: Buffer) => {
      const ab = new ArrayBuffer(b.byteLength);
      new Uint8Array(ab).set(b);
      return ab;
    };

    // Default: proxy bytes as-is
    if (profile !== "print" && profile !== "hd") {
      const contentType = upstream.headers.get("content-type") || "application/octet-stream";
      return new Response(asArrayBuffer(sourceBytes), {
        status: 200,
        headers: {
          "content-type": contentType,
          "cache-control": "public, max-age=3600",
        },
      });
    }

    // Print/HD profiles: ensure a high-quality JPG with a large pixel dimension for crisp zoom.
    // - print: >= 2MB
    // - hd: >= 4MB (more aggressive), and prefer larger long-edge targets
    const MIN_BYTES = profile === "hd" ? 4 * 1024 * 1024 : 2 * 1024 * 1024;
    const MAX_LONG_EDGE = 8000;
    const TARGET_LONG_EDGES = profile === "hd" ? [6500, 8000] : [5000, 6500, 8000];

    const img = sharp(sourceBytes, { failOn: "none" });
    const meta = await img.metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    const longEdge = Math.max(width, height);

    const encodeJpeg = async (input: sharp.Sharp, q: number) => {
      return await input
        .jpeg({
          quality: q,
          chromaSubsampling: "4:4:4",
          mozjpeg: true,
        })
        .toBuffer();
    };

    // 1) Try re-encoding at same size with high quality
    let out = await encodeJpeg(img.clone(), 95);
    if (out.length >= MIN_BYTES) {
      return new Response(asArrayBuffer(out), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "cache-control": "public, max-age=3600",
        },
      });
    }

    out = await encodeJpeg(img.clone(), 100);
    if (out.length >= MIN_BYTES) {
      return new Response(asArrayBuffer(out), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "cache-control": "public, max-age=3600",
        },
      });
    }

    // 2) If still too small, upscale to increase pixel data, then re-encode
    for (const targetLongEdge of TARGET_LONG_EDGES) {
      const effectiveTarget = Math.min(targetLongEdge, MAX_LONG_EDGE);
      // If we can't detect dims, just skip resizing and return best-effort
      if (!width || !height) break;

      const needsUpscale = longEdge < effectiveTarget;
      const scale = needsUpscale ? effectiveTarget / longEdge : 1;
      const newW = Math.min(Math.round(width * scale), MAX_LONG_EDGE);
      const newH = Math.min(Math.round(height * scale), MAX_LONG_EDGE);

      const resized = img
        .clone()
        .resize(newW, newH, { fit: "fill", kernel: sharp.kernel.lanczos3 });

      out = await encodeJpeg(resized, 100);
      if (out.length >= MIN_BYTES) {
        return new Response(asArrayBuffer(out), {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
            "cache-control": "public, max-age=3600",
          },
        });
      }
    }

    // Best-effort fallback (still high-quality JPG even if below 2MB)
    return new Response(asArrayBuffer(out), {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[external-image] error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}


