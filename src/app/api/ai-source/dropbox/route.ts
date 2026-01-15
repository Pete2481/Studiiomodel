import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { cleanDropboxLink } from "@/lib/utils";

export const runtime = "nodejs";

// Dropbox requires JSON args in the `Dropbox-API-Arg` header. Node's fetch (undici) enforces ByteString
// for header values, so we must escape non-Latin-1 chars to avoid runtime errors.
function toDropboxApiArg(obj: any) {
  return JSON.stringify(obj).replace(/[^\u0000-\u00FF]/g, (ch) => {
    const hex = ch.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${hex}`;
  });
}

function getSigningSecret() {
  // Prefer a dedicated secret; fall back to NEXTAUTH_SECRET if present.
  const s = process.env.AI_SOURCE_SIGNING_SECRET || process.env.NEXTAUTH_SECRET || "";
  if (!s) throw new Error("Missing AI_SOURCE_SIGNING_SECRET (or NEXTAUTH_SECRET fallback).");
  return s;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSigningSecret()).update(payload).digest("hex");
}

function safeEqualHex(a: string, b: string) {
  try {
    const aa = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const galleryId = searchParams.get("galleryId") || "";
    const sharedLinkRaw = searchParams.get("sharedLink") || "";
    const path = searchParams.get("path") || "";
    const expRaw = searchParams.get("exp") || "";
    const sig = searchParams.get("sig") || "";

    if (!galleryId || !sharedLinkRaw || !path || !expRaw || !sig) {
      return new NextResponse("Missing params", { status: 400 });
    }

    // Basic path traversal guard
    if (path.includes("..") || path.includes("./")) {
      return new NextResponse("Invalid path", { status: 400 });
    }

    const exp = Number(expRaw);
    if (!Number.isFinite(exp)) return new NextResponse("Invalid exp", { status: 400 });
    const now = Math.floor(Date.now() / 1000);
    if (exp < now) return new NextResponse("Expired", { status: 403 });

    const sharedLink = cleanDropboxLink(sharedLinkRaw);
    const payload = `${galleryId}|${exp}|${sharedLink}|${path}`;
    const expected = sign(payload);
    if (!safeEqualHex(expected, sig)) return new NextResponse("Bad signature", { status: 403 });

    // Resolve gallery + tenant token. Also ensure the sharedLink matches this gallery's configured link.
    const gallery = await prisma.gallery.findFirst({
      where: { id: galleryId, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        metadata: true,
        tenant: { select: { id: true, dropboxAccessToken: true, dropboxRefreshToken: true } },
      },
    });
    if (!gallery?.tenant?.dropboxAccessToken) return new NextResponse("Gallery not found", { status: 404 });

    const metaLink = cleanDropboxLink(((gallery.metadata as any)?.dropboxLink as string) || "");
    if (!metaLink || cleanDropboxLink(metaLink) !== sharedLink) {
      return new NextResponse("Shared link mismatch", { status: 403 });
    }

    let accessToken = gallery.tenant.dropboxAccessToken;
    const refreshToken = gallery.tenant.dropboxRefreshToken;

    const getSharedFile = async (token: string) => {
      const arg: any = { url: sharedLink };
      if (path && path !== "/" && path !== "") arg.path = path;
      return fetch("https://content.dropboxapi.com/2/sharing/get_shared_link_file", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Dropbox-API-Arg": toDropboxApiArg(arg),
        },
      });
    };

    let upstream = await getSharedFile(accessToken);

    if (upstream.status === 401 && refreshToken) {
      const refreshResponse = await fetch("https://api.dropbox.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: process.env.DROPBOX_CLIENT_ID!,
          client_secret: process.env.DROPBOX_CLIENT_SECRET!,
        }),
      });
      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        accessToken = refreshData.access_token;
        const tPrisma = await getTenantPrisma(gallery.tenantId);
        await tPrisma.tenant.update({
          where: { id: gallery.tenantId },
          data: { dropboxAccessToken: accessToken },
        });
        upstream = await getSharedFile(accessToken);
      }
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return new NextResponse(text || "Upstream fetch failed", { status: upstream.status });
    }

    // Stream bytes through as-is (full resolution).
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
        // Short cache: signed URL already limits access; allow CDN/browser caching briefly.
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    console.error("[ai-source/dropbox] error", e);
    return new NextResponse("Server error", { status: 500 });
  }
}


