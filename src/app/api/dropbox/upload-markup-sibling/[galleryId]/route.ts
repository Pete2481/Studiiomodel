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
    const isAdminLike = isTenantStaffRole(role);
    if (!isAdminLike) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

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

    const tPrisma = await getTenantPrisma(tenantId);
    const tenant = await tPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { dropboxAccessToken: true, dropboxRefreshToken: true },
    });
    if (!tenant?.dropboxAccessToken) {
      return NextResponse.json({ error: "Dropbox not connected" }, { status: 400 });
    }

    // Resolve target directory (same logic shape as saveAIResultSiblingToDropbox)
    let resolvedDir = path.posix.dirname(originalPath || "/");
    resolvedDir = resolvedDir === "." ? "/" : resolvedDir;

    if (resolvedDir === "/" || resolvedDir === "") {
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
    const targetPath = path.posix.join(resolvedDir || "/", `${baseName}-MARKUP.jpg`);

    let accessToken = tenant.dropboxAccessToken;
    const upload = async (token: string) => {
      return fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({
            path: targetPath,
            mode: "add",
            autorename: true,
            mute: false,
            strict_conflict: true,
          }),
        },
        body: bytes,
      });
    };

    let res = await upload(accessToken);
    if (res.status === 401 && tenant.dropboxRefreshToken) {
      const newToken = await refreshDropboxAccessToken(tenantId, tenant.dropboxRefreshToken);
      if (newToken) {
        accessToken = newToken;
        res = await upload(accessToken);
      }
    }

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json({ error: `Failed to save to Dropbox: ${errorText}` }, { status: 502 });
    }

    const data: any = await res.json().catch(() => null);
    return NextResponse.json({
      success: true,
      path: data?.path_display || data?.path_lower || targetPath,
      name: data?.name || `${baseName}-MARKUP.jpg`,
    });
  } catch (e: any) {
    console.error("[upload-markup-sibling] error", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}


