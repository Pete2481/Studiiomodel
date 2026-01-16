import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanDropboxLink } from "@/lib/utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ galleryId: string }> },
) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const { galleryId } = await params;
  const gallery = await prisma.gallery.findFirst({
    where: { id: galleryId, deletedAt: null },
    select: {
      id: true,
      tenantId: true,
      metadata: true,
      tenant: {
        select: {
          storageProvider: true,
          dropboxAccessToken: true,
          dropboxRefreshToken: true,
          googleDriveRefreshToken: true,
        } as any,
      },
    } as any,
  });

  if (!gallery) {
    return NextResponse.json({ ok: false, error: "Gallery not found" }, { status: 404 });
  }

  const meta: any = (gallery as any).metadata || {};
  const rawShareLink = String(meta?.dropboxLink || "");
  const cleanedShareLink = rawShareLink ? cleanDropboxLink(rawShareLink) : "";

  // Mirror provider selection logic used by src/app/actions/storage.ts
  let provider = (gallery as any)?.tenant?.storageProvider || "DROPBOX";
  if (rawShareLink.includes("drive.google.com")) provider = "GOOGLE_DRIVE";

  const tenantHasDropboxToken = !!(gallery as any)?.tenant?.dropboxAccessToken;
  const tenantHasDropboxRefresh = !!(gallery as any)?.tenant?.dropboxRefreshToken;
  const tenantHasGoogleDriveRefresh = !!(gallery as any)?.tenant?.googleDriveRefreshToken;

  return NextResponse.json({
    ok: true,
    galleryId: gallery.id,
    galleryTenantId: gallery.tenantId,
    provider,
    hasDropboxLink: !!rawShareLink,
    dropboxLink: rawShareLink || null,
    dropboxLinkClean: cleanedShareLink || null,
    tenantHasDropboxToken,
    tenantHasDropboxRefresh,
    tenantHasGoogleDriveRefresh,
    host: req.headers.get("host") || null,
  });
}


