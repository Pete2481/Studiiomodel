import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { google } from "googleapis";
import sharp from "sharp";

/**
 * Proxy route to fetch assets from Google Drive.
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
    const fileId = searchParams.get("id");
    const size = searchParams.get("size"); // Capture the requested size
    const profile = (searchParams.get("profile") || "").toLowerCase();

    if (!fileId) {
      return new NextResponse("File ID is required", { status: 400 });
    }

    // 1. Resolve Gallery & Permissions
    const gallery = await prisma.gallery.findFirst({
      where: { id: galleryId, deletedAt: null },
      include: { tenant: true }
    });

    if (!gallery) {
      return new NextResponse("Gallery not found", { status: 404 });
    }

    if (!gallery.tenant?.googleDriveRefreshToken) {
      console.error(`[PROXY] Google Drive not connected for tenant: ${gallery.tenantId}`);
      return new NextResponse("Google Drive not connected", { status: 404 });
    }

    // 2. Auth Check
    const session = await auth();
    const isStaff = session?.user?.role === "TENANT_ADMIN" || session?.user?.role === "TEAM_MEMBER";
    const isOwner = session?.user?.clientId === gallery.clientId;
    const isSharedRequest = searchParams.get("shared") === "true";

    if (gallery.status === "DRAFT" && !isStaff && !isSharedRequest) {
      return new NextResponse("Gallery not published", { status: 403 });
    }

    // 3. Initialize Google Drive Client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_DRIVE_CLIENT_ID,
      process.env.GOOGLE_DRIVE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      refresh_token: gallery.tenant.googleDriveRefreshToken
    });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // 4. Fetch File Content from Google Drive
    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    
    // Explicitly type as any to avoid Buffer<ArrayBuffer> vs Buffer<ArrayBufferLike> build errors
    let buffer: any = Buffer.from(response.data as ArrayBuffer);
    let contentType = response.headers["content-type"] || "image/jpeg";

    // HERO PROFILE: crisp banner render for desktop/retina
    if (profile === "hero" && contentType.startsWith("image/")) {
      const MAX_LONG_EDGE = 3840;
      try {
        const img = sharp(buffer, { failOn: "none" }).rotate();
        const meta = await img.metadata();
        const w = meta.width || 0;
        const h = meta.height || 0;
        const longEdge = Math.max(w, h);

        const resized =
          longEdge > 0 && longEdge > MAX_LONG_EDGE
            ? img.resize({
                width: w >= h ? MAX_LONG_EDGE : undefined,
                height: h > w ? MAX_LONG_EDGE : undefined,
                fit: "inside",
                withoutEnlargement: true,
                kernel: sharp.kernel.lanczos3,
              })
            : img;

        buffer = await resized
          .jpeg({ quality: 94, mozjpeg: true, chromaSubsampling: "4:4:4" })
          .toBuffer();
        contentType = "image/jpeg";
      } catch (sharpError) {
        console.error("SHARP HERO ERROR:", sharpError);
      }
    } else
    // 5. Apply Optimization if a size is requested
    if (size && contentType.startsWith("image/")) {
      const sizeMap: Record<string, { w: number; h: number }> = {
        "w64h64": { w: 64, h: 64 },
        "w480h320": { w: 480, h: 320 },
        "w1024h768": { w: 1024, h: 768 },
        "w2048h1536": { w: 2048, h: 1536 }
      };

      const dims = sizeMap[size] || sizeMap["w480h320"];

      try {
        buffer = await sharp(buffer)
          .resize(dims.w, dims.h, { 
            fit: 'inside', 
            withoutEnlargement: true 
          })
          .webp({ quality: 80 }) // Convert to WebP for modern format savings
          .toBuffer();
        
        contentType = "image/webp";
      } catch (sharpError) {
        console.error("SHARP ERROR:", sharpError);
        // Fallback to original buffer if sharp fails
      }
    }

    // 6. Return the optimized image
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      }
    });

  } catch (error: any) {
    console.error("GOOGLE DRIVE PROXY ERROR:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

