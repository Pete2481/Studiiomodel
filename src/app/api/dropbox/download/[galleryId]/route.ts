import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import sharp from "sharp";
import { checkSubscriptionStatus } from "@/lib/tenant-guard";

// Dropbox requires JSON args in the `Dropbox-API-Arg` header. Node's fetch (undici) enforces ByteString
// for header values, so we must escape non-Latin-1 chars (e.g. U+202F) to avoid runtime errors.
function toDropboxApiArg(obj: any) {
  return JSON.stringify(obj).replace(/[^\u0000-\u00FF]/g, (ch) => {
    const hex = ch.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${hex}`;
  });
}

/**
 * PROXY ROUTE: Downloads high-res raw assets from Dropbox.
 * Bypasses CORS and handles token refreshing automatically.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ galleryId: string }> }
) {
  try {
    const { galleryId } = await params;
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path");
    const sharedLink = searchParams.get("sharedLink");
    const applyBranding = searchParams.get("applyBranding") === "true";

    if (!path) {
      return new NextResponse("Path is required", { status: 400 });
    }

    // 1. Fetch gallery and tenant tokens, and client branding info
    const gallery = await prisma.gallery.findUnique({
      where: { id: galleryId },
      include: {
        tenant: {
          select: {
            dropboxAccessToken: true,
            dropboxRefreshToken: true,
            id: true
          }
        },
        client: {
          select: {
            watermarkUrl: true,
            watermarkSettings: true
          }
        }
      }
    });

    if (!gallery?.tenant?.dropboxAccessToken) {
      return new NextResponse("Dropbox not connected", { status: 404 });
    }

    // SECURITY: Ensure the tenant has an active subscription/trial
    const isSubscribed = await checkSubscriptionStatus(gallery.tenantId);
    if (!isSubscribed) {
      return new NextResponse("Action-Locked: Studio subscription required for high-res downloads.", { status: 402 });
    }

    // SECURITY: Public access only for READY/DELIVERED galleries
    const session = await auth();
    const isStaff = session?.user?.role === "TENANT_ADMIN" || session?.user?.role === "TEAM_MEMBER";
    
    if (gallery.status === "DRAFT" && !isStaff) {
      return new NextResponse("Gallery not published", { status: 403 });
    }

    // SECURITY: Verify the path is allowed for this gallery
    if (!sharedLink) {
      const metadata = gallery.metadata as any;
      const allowedFolders = metadata?.imageFolders || [];
      const isPathAllowed = allowedFolders.some((f: any) => path.toLowerCase().startsWith(f.path.toLowerCase()));
      
      if (!isPathAllowed) {
        console.error(`[SECURITY] Blocked unauthorized path download: ${path} for gallery ${galleryId}`);
        return new NextResponse("Unauthorized path", { status: 403 });
      }
    }

    let accessToken = gallery.tenant.dropboxAccessToken;

    // Helper to refresh token
    const refreshToken = async () => {
      const res = await fetch("https://api.dropbox.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: gallery.tenant.dropboxRefreshToken!,
          client_id: process.env.DROPBOX_CLIENT_ID!,
          client_secret: process.env.DROPBOX_CLIENT_SECRET!,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await prisma.tenant.update({
          where: { id: gallery.tenantId },
          data: { dropboxAccessToken: data.access_token }
        });
        return data.access_token;
      }
      return null;
    };

    // 2. Initial attempt to download from Dropbox
    const getDownloadResponse = async (token: string) => {
      if (sharedLink) {
        // Use sharing/get_shared_link_file for shared link assets
        const arg: any = { url: sharedLink };
        // Only provide path if it's not the root (which is the case for folder links)
        if (path && path !== "/" && path !== "") {
          arg.path = path;
        }
        
        return fetch("https://content.dropboxapi.com/2/sharing/get_shared_link_file", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Dropbox-API-Arg": toDropboxApiArg(arg)
          }
        });
      } else {
        // Use files/download for direct path assets
        return fetch("https://content.dropboxapi.com/2/files/download", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Dropbox-API-Arg": toDropboxApiArg({ path })
          }
        });
      }
    };

    let response = await getDownloadResponse(accessToken);

    // 3. Handle token expiration (401)
    if (response.status === 401 && gallery.tenant.dropboxRefreshToken) {
      const newToken = await refreshToken();
      if (newToken) {
        response = await getDownloadResponse(newToken);
      }
    }

    if (!response.ok) {
      const err = await response.text();
      console.error("Dropbox Download Proxy Error:", err);
      return new NextResponse("Failed to fetch from Dropbox", { status: response.status });
    }

    // 4. Handle file content and optional branding
    // PERFORMANCE: Only use Buffer if branding is needed. Otherwise, stream it.
    if (applyBranding && gallery.client?.watermarkUrl) {
      const blob = await response.blob();
      const buffer: any = Buffer.from(await blob.arrayBuffer());
      
      try {
        const logoUrl = gallery.client.watermarkUrl;
        const logoResponse = await fetch(logoUrl);
        if (logoResponse.ok) {
          const logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
          const settings: any = gallery.client.watermarkSettings || { x: 50, y: 50, scale: 100, opacity: 60 };
          
          const metadata = await sharp(buffer).metadata();
          const imgWidth = metadata.width || 1000;
          const imgHeight = metadata.height || 1000;

          const logoScale = settings.scale / 100;
          const processedLogo = await sharp(logoBuffer)
            .resize({ 
              width: Math.round(imgWidth * 0.15 * logoScale),
              fit: 'inside' 
            })
            .composite([{
              input: Buffer.from([255, 255, 255, Math.round((settings.opacity / 100) * 255)]),
              raw: { width: 1, height: 1, channels: 4 },
              tile: true,
              blend: 'dest-in'
            }])
            .toBuffer();

          const logoMeta = await sharp(processedLogo).metadata();
          const logoW = logoMeta.width || Math.round(imgWidth * 0.15 * logoScale);
          const logoH = logoMeta.height || logoW;

          const brandedBuffer = await sharp(buffer)
            .composite([{
              input: processedLogo,
              left: Math.round((settings.x / 100) * imgWidth - (logoW / 2)),
              top: Math.round((settings.y / 100) * imgHeight - (logoH / 2))
            }])
            .toBuffer();

                  return new NextResponse(Buffer.from(brandedBuffer), {
                    headers: {
                      "Content-Type": "image/jpeg",
                      "Content-Disposition": `attachment; filename="branded-${path.split('/').pop()}"`,
                    }
                  });
                }
              } catch (brandingError) {
                console.error("Branding application failed:", brandingError);
              }
              
              // Fallback to buffer if branding failed
              return new NextResponse(Buffer.from(buffer), {
                headers: {
                  "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
                  "Content-Disposition": `attachment; filename="${path.split('/').pop()}"`,
                }
              });
    }

    // STREAMING: Return the Dropbox stream directly for efficiency
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${path.split('/').pop()}"`,
      }
    });

  } catch (error) {
    console.error("PROXY DOWNLOAD ERROR:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

