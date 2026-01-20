import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWLIST_HOSTS = new Set<string>([
  "www.dropbox.com",
  "dropbox.com",
  "dl.dropbox.com",
  "dl.dropboxusercontent.com",
]);

function toDirectDropboxUrl(input: string) {
  // Keep it simple: convert common Dropbox share links to dl.dropboxusercontent + raw=1
  let u = input
    .replace("https://www.dropbox.com", "https://dl.dropboxusercontent.com")
    .replace("https://dropbox.com", "https://dl.dropboxusercontent.com")
    .replace("https://dl.dropbox.com", "https://dl.dropboxusercontent.com");

  if (!u.includes("?")) return `${u}?raw=1`;
  if (!u.includes("dl=") && !u.includes("raw=")) return `${u}&raw=1`;
  return u.replace("dl=0", "raw=1").replace("dl=1", "raw=1");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }

    if (!ALLOWLIST_HOSTS.has(parsed.hostname)) {
      return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
    }

    const direct = toDirectDropboxUrl(parsed.toString());
    const upstream = await fetch(direct, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const arrayBuffer = await upstream.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);
    const asArrayBuffer = (b: Buffer) => {
      const ab = new ArrayBuffer(b.byteLength);
      new Uint8Array(ab).set(b);
      return ab;
    };

    return new Response(asArrayBuffer(bytes), {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[logo-proxy] error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}


