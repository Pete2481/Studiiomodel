import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { auth } from "@/auth";
import sharp from "sharp";
import { logger } from "@/lib/logger";

// In-memory cache for logos to avoid repeated fetches during high-volume thumbnail requests
const logoCache = new Map<string, { buffer: Buffer, timestamp: number }>();
const LOGO_CACHE_TTL = 1000 * 60 * 60; // 1 hour

/**
 * Proxy route to fetch high-res assets from Dropbox.
 * This avoids CORS issues and keeps tokens server-side.
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ galleryId: string }> }
) {
  try {
    const params = await props.params;
    const galleryId = params.galleryId;
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");
    const sharedLink = searchParams.get("sharedLink");
    const isSharedRequest = searchParams.get("shared") === "true";
    const size = searchParams.get("size") || "w640h480";

    if (isSharedRequest) {
      console.log(`[PROXY] Allowing shared request for gallery: ${galleryId}, path: ${path}`);
    }

    if (!path) {
      return new NextResponse("Path is required", { status: 400 });
    }

    // 1. Path Traversal Guard
    if (path.includes("..") || path.includes("./")) {
      logger.error("Blocked path traversal attempt", null, { path, galleryId });
      return new NextResponse("Invalid path", { status: 400 });
    }

    // 2. Validate size
    const validSizes = ["w32h32", "w64h64", "w128h128", "w640h480", "w960h640", "w1024h768", "w2048h1536"];
    const thumbnailSize = validSizes.includes(size) ? size : "w640h480";

    // 3. Resolve Gallery & Permissions
    const gallery = await prisma.gallery.findFirst({
      where: { id: galleryId, deletedAt: null },
      include: { tenant: true }
    });

    if (!gallery) {
      return new NextResponse("Gallery not found", { status: 404 });
    }

    const session = await auth();
    const isStaff = session?.user?.role === "TENANT_ADMIN" || session?.user?.role === "TEAM_MEMBER";
    const isOwner = session?.user?.clientId === gallery.clientId;
    
    // SECURITY: Public access only for READY/DELIVERED (unless it's a shared curated link)
    if (gallery.status === "DRAFT" && !isStaff && !isSharedRequest) {
      return new NextResponse("Gallery not published", { status: 403 });
    }

    // SECURITY: Locked galleries only for staff/owner/shared links
    if (gallery.isLocked && !isStaff && !isOwner && !isSharedRequest) {
      console.warn(`[PROXY] Blocked access to locked gallery: ${galleryId} (Not staff/owner/shared)`);
      return new NextResponse("Gallery Locked", { status: 403 });
    }

    // SECURITY: Path verification
    if (!sharedLink && !isSharedRequest) {
      const metadata = gallery.metadata as any;
      const allowedFolders = metadata?.imageFolders || [];
      const isPathAllowed = allowedFolders.some((f: any) => path.toLowerCase().startsWith(f.path.toLowerCase()));
      
      if (!isPathAllowed) {
        console.error(`[SECURITY] Blocked unauthorized path access: ${path} for gallery ${galleryId}`);
        return new NextResponse("Unauthorized path", { status: 403 });
      }
    }

    // 4. Resolve Dropbox Token & Fetch
    if (!gallery.tenant?.dropboxAccessToken) {
      console.error(`[PROXY] Dropbox not connected for tenant: ${gallery.tenantId}`);
      return new NextResponse("Dropbox not connected", { status: 404 });
    }

    let accessToken = gallery.tenant.dropboxAccessToken;
    const tenantId = gallery.tenantId;
    const refreshToken = gallery.tenant.dropboxRefreshToken;

    // Call Dropbox
    const resource = sharedLink 
      ? { ".tag": "link", "url": sharedLink, "path": path }
      : { ".tag": "path", "path": path };

    const getThumbnail = async (token: string) => {
      return fetch("https://content.dropboxapi.com/2/files/get_thumbnail_v2", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Dropbox-API-Arg": JSON.stringify({
            resource,
            format: "jpeg",
            size: thumbnailSize,
            mode: "bestfit"
          })
        }
      });
    };

    let dbResponse = await getThumbnail(accessToken);

    if (dbResponse.status === 401 && refreshToken) {
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
        
        // Use Scoped Client for update
        const tPrisma = await getTenantPrisma(tenantId);
        await tPrisma.tenant.update({
          where: { id: tenantId },
          data: { dropboxAccessToken: accessToken }
        });
        
        dbResponse = await getThumbnail(accessToken);
      }
    }

    if (!dbResponse.ok) {
      return new NextResponse("Failed to fetch asset", { status: dbResponse.status });
    }

    // 5. Optimization & Watermarking
    const blob = await dbResponse.blob();
    const arrayBuffer = await blob.arrayBuffer();
    let buffer: any = Buffer.from(arrayBuffer);
    let contentType = "image/jpeg";

    try {
      let sharpInstance = sharp(buffer);

      // Apply Watermark if enabled
      if (gallery.watermarkEnabled && gallery.tenant.logoUrl) {
        let logoBuffer: Buffer | null = null;
        const cached = logoCache.get(gallery.tenant.logoUrl);
        
        if (cached && Date.now() - cached.timestamp < LOGO_CACHE_TTL) {
          logoBuffer = cached.buffer;
        } else {
          const logoResponse = await fetch(gallery.tenant.logoUrl);
          if (logoResponse.ok) {
            logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
            logoCache.set(gallery.tenant.logoUrl, { buffer: logoBuffer, timestamp: Date.now() });
          }
        }

        if (logoBuffer) {
          const processedLogo = await sharp(logoBuffer)
            .resize({ width: 300, height: 300, fit: 'inside' })
            .composite([{
              input: Buffer.from([255, 255, 255, 128]),
              raw: { width: 1, height: 1, channels: 4 },
              tile: true,
              blend: 'dest-in'
            }])
            .toBuffer();

          sharpInstance = sharpInstance.composite([{
            input: processedLogo,
            gravity: 'center'
          }]);
        }
      }

      // Always convert to WebP for better compression
      buffer = await sharpInstance
        .webp({ quality: 80 })
        .toBuffer();
      contentType = "image/webp";

    } catch (optimizationError) {
      console.error("[PROXY] Image optimization/watermark failed:", optimizationError);
      // Fallback to original jpeg buffer if optimization fails
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });

  } catch (error) {
    console.error("PROXY ERROR:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

