import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { isTenantStaffRole } from "@/lib/permission-service";
import path from "path";

export const runtime = "nodejs";

async function refreshDropboxAccessToken(tenantId: string, refreshToken: string) {
  try {
    const tPrisma = await getTenantPrisma(tenantId);
    const response = await fetch("https://api.dropbox.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.DROPBOX_CLIENT_ID!,
        client_secret: process.env.DROPBOX_CLIENT_SECRET!,
      }),
    });

    if (!response.ok) return null;

    const data: any = await response.json().catch(() => null);
    const accessToken = String(data?.access_token || "");
    if (!accessToken) return null;

    await tPrisma.tenant.update({
      where: { id: tenantId },
      data: { dropboxAccessToken: accessToken, updatedAt: new Date() },
    });

    return accessToken;
  } catch (e) {
    console.error("[upload-markup-sibling] refresh token error", e);
    return null;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ galleryId: string }> },
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = (session.user as any)?.role;
    const sessionTenantId = (session.user as any)?.tenantId;
    const sessionClientId = (session.user as any)?.clientId ? String((session.user as any).clientId) : "";
    const isStaff = isTenantStaffRole(role);
    const isClient = String(role || "").toUpperCase() === "CLIENT";

    const { galleryId } = await params;
    if (!galleryId) return NextResponse.json({ error: "Missing galleryId" }, { status: 400 });

    const form = await req.formData();
    const tenantId = String(form.get("tenantId") || "");
    const originalPath = String(form.get("originalPath") || "");
    const originalName = String(form.get("originalName") || "");
    const file = form.get("file");

    if (!tenantId || !originalName || !file) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (sessionTenantId && sessionTenantId !== tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    }

    // Access rules:
    // - Staff: OK
    // - Client: only if they own this published gallery (and we ignore originalPath for safety)
    let forcedGalleryDir: string | null = null;
    if (!isStaff) {
      if (!isClient) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      if (!sessionClientId) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

      const gallery = await prisma.gallery.findFirst({
        where: { id: String(galleryId), deletedAt: null },
        select: { tenantId: true, clientId: true, status: true, metadata: true },
      });
      if (!gallery) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (String(gallery.tenantId) !== String(tenantId)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      if (!gallery.clientId || String(gallery.clientId) !== sessionClientId) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      if (String(gallery.status) !== "READY" && String(gallery.status) !== "DELIVERED") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      const meta: any = (gallery as any)?.metadata || {};
      const mappedFolderPath = meta?.imageFolders?.[0]?.path;
      if (typeof mappedFolderPath === "string" && mappedFolderPath.startsWith("/")) {
        forcedGalleryDir = mappedFolderPath;
      } else if (typeof meta?.dropboxLink === "string" && meta.dropboxLink.trim()) {
        // We will resolve this after we have the tenant token below.
        forcedGalleryDir = "/";
      }
    }

    const tPrisma = await getTenantPrisma(tenantId);
    const tenant = await tPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { dropboxAccessToken: true, dropboxRefreshToken: true },
    });
    if (!tenant?.dropboxAccessToken) {
      return NextResponse.json({ error: "Dropbox not connected" }, { status: 400 });
    }

    // Resolve target directory (same logic shape as saveAIResultSiblingToDropbox)
    let resolvedDir = forcedGalleryDir && forcedGalleryDir !== "/" ? forcedGalleryDir : path.posix.dirname(originalPath || "/");
    resolvedDir = resolvedDir === "." ? "/" : resolvedDir;

    if ((resolvedDir === "/" || resolvedDir === "") || forcedGalleryDir === "/") {
      try {
        const gallery = await prisma.gallery.findUnique({
          where: { id: galleryId },
          select: { metadata: true },
        });
        const meta: any = (gallery as any)?.metadata || {};
        const mappedFolderPath = meta?.imageFolders?.[0]?.path;
        if (typeof mappedFolderPath === "string" && mappedFolderPath.startsWith("/")) {
          resolvedDir = mappedFolderPath;
        } else if (typeof meta?.dropboxLink === "string" && meta.dropboxLink.trim()) {
          const metaRes = await fetch("https://api.dropboxapi.com/2/sharing/get_shared_link_metadata", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${tenant.dropboxAccessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: meta.dropboxLink }),
          });
          if (metaRes.ok) {
            const sharedMeta: any = await metaRes.json().catch(() => null);
            const p = sharedMeta?.path_lower || sharedMeta?.path_display;
            if (typeof p === "string" && p.startsWith("/")) {
              resolvedDir = sharedMeta?.[".tag"] === "folder" ? p : path.posix.dirname(p);
            }
          }
        }
      } catch (e) {
        // non-blocking
      }
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const baseName = String(originalName || "")
      .replace(/\.[^.]+$/, "")
      .replace(/-MARKUP$/i, "")
      .replace(/-AI$/i, "");

    let accessToken = tenant.dropboxAccessToken;
    const upload = async (token: string, dropboxPath: string) => {
      return fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({
            path: dropboxPath,
            mode: "add",
            autorename: false,
            mute: false,
            strict_conflict: true,
          }),
        },
        body: bytes,
      });
    };

    // Save naming: baseName-MARKUP.jpg, then baseName-MARKUP1.jpg, baseName-MARKUP2.jpg, ...
    let lastErrorText = "";
    for (let i = 0; i <= 20; i++) {
      const suffix = i === 0 ? "" : String(i);
      const candidatePath = path.posix.join(resolvedDir || "/", `${baseName}-MARKUP${suffix}.jpg`);

      let res = await upload(accessToken, candidatePath);
      if (res.status === 401 && tenant.dropboxRefreshToken) {
        const newToken = await refreshDropboxAccessToken(tenantId, tenant.dropboxRefreshToken);
        if (newToken) {
          accessToken = newToken;
          res = await upload(accessToken, candidatePath);
        }
      }

      if (res.status === 409) continue;

      if (!res.ok) {
        lastErrorText = await res.text().catch(() => "");
        return NextResponse.json({ error: `Failed to save to Dropbox: ${lastErrorText}` }, { status: 502 });
      }

      const data: any = await res.json().catch(() => null);
      return NextResponse.json({
        success: true,
        path: data?.path_display || data?.path_lower || candidatePath,
        name: data?.name || `${baseName}-MARKUP${suffix}.jpg`,
      });
    }

    return NextResponse.json(
      { error: `Failed to save to Dropbox: too many filename conflicts${lastErrorText ? ` (${lastErrorText})` : ""}` },
      { status: 502 },
    );
  } catch (e: any) {
    console.error("[upload-markup-sibling] error", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}


