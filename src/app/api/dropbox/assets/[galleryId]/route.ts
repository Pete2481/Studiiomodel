import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { auth } from "@/auth";
import sharp from "sharp";
import { logger } from "@/lib/logger";

// In-memory cache for logos to avoid repeated fetches during high-volume thumbnail requests
const logoCache = new Map<string, { buffer: Buffer, timestamp: number }>();
const LOGO_CACHE_TTL = 1000 * 60 * 60; // 1 hour

// Dropbox requires JSON args in the `Dropbox-API-Arg` header. Node's fetch (undici) enforces ByteString
// for header values, so we must escape non-Latin-1 chars (e.g. U+202F) to avoid runtime errors.
function toDropboxApiArg(obj: any) {
  return JSON.stringify(obj).replace(/[^\u0000-\u00FF]/g, (ch) => {
    const hex = ch.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${hex}`;
  });
}

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
    const profile = (searchParams.get("profile") || "").toLowerCase();

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
    const validSizes = ["w32h32", "w64h64", "w128h128", "w480h320", "w640h480", "w960h640", "w1024h768", "w2048h1536"];
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

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const withRetry429 = async (fn: () => Promise<Response>, attempts: number = 4) => {
      let last: Response | null = null;
      for (let i = 0; i < attempts; i++) {
        const res = await fn();
        last = res;
        if (res.status !== 429) return res;
        await sleep(300 * Math.pow(2, i));
      }
      return last!;
    };

    // HERO PROFILE: fetch full bytes, then encode a crisp hero render.
    // This avoids Dropbox thumbnail limitations and keeps banners sharp on desktop/retina.
    if (profile === "hero") {
      const MAX_LONG_EDGE = 3840;

      const getSharedFile = async (token: string) => {
        const arg: any = { url: sharedLink };
        if (path && path !== "/" && path !== "") arg.path = path;
        return fetch("https://content.dropboxapi.com/2/sharing/get_shared_link_file", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Dropbox-API-Arg": toDropboxApiArg(arg),
          },
        });
      };

      const getFile = async (token: string) => {
        return fetch("https://content.dropboxapi.com/2/files/download", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Dropbox-API-Arg": toDropboxApiArg({ path }),
          },
        });
      };

      let fileRes = await withRetry429(() => (sharedLink ? getSharedFile(accessToken) : getFile(accessToken)));
      if (fileRes.status === 401 && refreshToken) {
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
          const tPrisma = await getTenantPrisma(tenantId);
          await tPrisma.tenant.update({
            where: { id: tenantId },
            data: { dropboxAccessToken: accessToken },
          });
          fileRes = await withRetry429(() => (sharedLink ? getSharedFile(accessToken) : getFile(accessToken)));
        }
      }

      if (!fileRes.ok) {
        logger.error("Dropbox hero fetch failed", null, { galleryId, status: fileRes.status });
        return new NextResponse("Failed to fetch asset", { status: fileRes.status });
      }

      const arrayBuffer = await fileRes.arrayBuffer();
      let buffer: any = Buffer.from(arrayBuffer);

      try {
        let sharpInstance = sharp(buffer, { failOn: "none" }).rotate();
        const meta = await sharpInstance.metadata();
        const w = meta.width || 0;
        const h = meta.height || 0;
        const longEdge = Math.max(w, h);
        const needsResize = longEdge > 0 && longEdge > MAX_LONG_EDGE;

        if (needsResize) {
          sharpInstance = sharpInstance.resize({
            width: w >= h ? MAX_LONG_EDGE : undefined,
            height: h > w ? MAX_LONG_EDGE : undefined,
            fit: "inside",
            withoutEnlargement: true,
            kernel: sharp.kernel.lanczos3,
          });
        }

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
              .resize({ width: 600, height: 600, fit: "inside" })
              .composite([
                {
                  input: Buffer.from([255, 255, 255, 128]),
                  raw: { width: 1, height: 1, channels: 4 },
                  tile: true,
                  blend: "dest-in",
                },
              ])
              .toBuffer();

            sharpInstance = sharpInstance.composite([
              {
                input: processedLogo,
                gravity: "center",
              },
            ]);
          }
        }

        buffer = await sharpInstance
          .jpeg({ quality: 94, mozjpeg: true, chromaSubsampling: "4:4:4" })
          .toBuffer();

        return new NextResponse(buffer, {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      } catch (e) {
        // Fallback: return original bytes
        return new NextResponse(buffer, {
          headers: {
            "Content-Type": fileRes.headers.get("Content-Type") || "application/octet-stream",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    // Call Dropbox
    const resource = sharedLink 
      ? { ".tag": "link", "url": sharedLink, "path": path }
      : { ".tag": "path", "path": path };

    const getThumbnail = async (token: string) => {
      return fetch("https://content.dropboxapi.com/2/files/get_thumbnail_v2", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Dropbox-API-Arg": toDropboxApiArg({
            resource,
            format: "jpeg",
            size: thumbnailSize,
            mode: "bestfit"
          })
        }
      });
    };

    let dbResponse = await withRetry429(() => getThumbnail(accessToken));

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
        
        dbResponse = await withRetry429(() => getThumbnail(accessToken));
      }
    }

    // Fallback: Dropbox can reject `get_thumbnail_v2` for some shared-link resources (notably with odd filenames).
    // In that case, download the shared file and generate a thumbnail server-side.
    if (!dbResponse.ok) {
      const parseSize = (s: string) => {
        const m = /^w(\d+)h(\d+)$/.exec(s);
        if (!m) return { width: 640, height: 480 };
        return { width: Number(m[1]), height: Number(m[2]) };
      };
      const { width, height } = parseSize(thumbnailSize);

      if (sharedLink) {

        const getSharedFile = async (token: string) => {
          const arg: any = { url: sharedLink };
          if (path && path !== "/" && path !== "") arg.path = path;
          return fetch("https://content.dropboxapi.com/2/sharing/get_shared_link_file", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Dropbox-API-Arg": toDropboxApiArg(arg),
            },
          });
        };

        let fileRes = await withRetry429(() => getSharedFile(accessToken));
        if (fileRes.status === 401 && refreshToken) {
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
            const tPrisma = await getTenantPrisma(tenantId);
            await tPrisma.tenant.update({
              where: { id: tenantId },
              data: { dropboxAccessToken: accessToken },
            });
            fileRes = await withRetry429(() => getSharedFile(accessToken));
          }
        }

        if (!fileRes.ok) {
          logger.error("Dropbox shared-link fallback failed", null, {
            galleryId,
            status: fileRes.status,
          });
          return new NextResponse("Failed to fetch asset", { status: dbResponse.status });
        }

        const arrayBuffer = await fileRes.arrayBuffer();
        let buffer: any = Buffer.from(arrayBuffer);
        let contentType = "image/webp";

        try {
          let sharpInstance = sharp(buffer).resize({ width, height, fit: "inside" });

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
                .resize({ width: 300, height: 300, fit: "inside" })
                .composite([
                  {
                    input: Buffer.from([255, 255, 255, 128]),
                    raw: { width: 1, height: 1, channels: 4 },
                    tile: true,
                    blend: "dest-in",
                  },
                ])
                .toBuffer();

              sharpInstance = sharpInstance.composite([
                {
                  input: processedLogo,
                  gravity: "center",
                },
              ]);
            }
          }

          buffer = await sharpInstance.webp({ quality: 80 }).toBuffer();
        } catch (e) {
          // If sharp fails, just return the original bytes.
          contentType = fileRes.headers.get("Content-Type") || "application/octet-stream";
        }

        return new NextResponse(buffer, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }

      // Non-shared fallback: download the file and generate a thumbnail server-side (prevents blank tiles).
      const getFile = async (token: string) => {
        return fetch("https://content.dropboxapi.com/2/files/download", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Dropbox-API-Arg": toDropboxApiArg({ path }),
          },
        });
      };

      let fileRes = await withRetry429(() => getFile(accessToken));
      if (fileRes.status === 401 && refreshToken) {
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
          const tPrisma = await getTenantPrisma(tenantId);
          await tPrisma.tenant.update({
            where: { id: tenantId },
            data: { dropboxAccessToken: accessToken },
          });
          fileRes = await withRetry429(() => getFile(accessToken));
        }
      }

      if (!fileRes.ok) {
        logger.error("Dropbox non-shared fallback failed", null, {
          galleryId,
          status: fileRes.status,
        });
        return new NextResponse("Failed to fetch asset", { status: dbResponse.status });
      }

      const arrayBuffer = await fileRes.arrayBuffer();
      let buffer: any = Buffer.from(arrayBuffer);
      let contentType = "image/webp";

      try {
        let sharpInstance = sharp(buffer).resize({ width, height, fit: "inside" });

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
              .resize({ width: 300, height: 300, fit: "inside" })
              .composite([
                {
                  input: Buffer.from([255, 255, 255, 128]),
                  raw: { width: 1, height: 1, channels: 4 },
                  tile: true,
                  blend: "dest-in",
                },
              ])
              .toBuffer();

            sharpInstance = sharpInstance.composite([
              {
                input: processedLogo,
                gravity: "center",
              },
            ]);
          }
        }

        buffer = await sharpInstance.webp({ quality: 80 }).toBuffer();
      } catch (e) {
        // If sharp fails, just return original bytes.
        contentType = fileRes.headers.get("Content-Type") || "application/octet-stream";
      }

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
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

