import { NextResponse } from "next/server";

// Tiny 1x1 PNG used for dev/E2E Dropbox upload tests (no external network dependency).
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBAp4l9/8AAAAASUVORK5CYII=";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const bytes = Buffer.from(PNG_BASE64, "base64");
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}


