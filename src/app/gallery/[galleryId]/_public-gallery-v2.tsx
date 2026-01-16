import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { Metadata } from "next";
import { getGalleryAssets } from "@/app/actions/storage";
import { GalleryPublicViewerV2 } from "@/components/modules/galleries/gallery-public-viewer-v2";
import { cleanDropboxLink } from "@/lib/utils";

export const V2_PAGE_SIZE = 16;

/**
 * Cached Gallery Shell Fetch - Minimal data for metadata and fast checks
 */
const getGalleryShell = cache(async (galleryId: string) => {
  return (await prisma.gallery.findFirst({
    where: { id: galleryId, deletedAt: null },
    include: {
      tenant: true,
      client: true,
    },
  })) as any;
});

/**
 * Cached Gallery Full Fetch - Detailed data for the viewer
 */
const getGalleryFull = cache(async (galleryId: string) => {
  return await prisma.gallery.findFirst({
    where: { id: galleryId, deletedAt: null },
    include: {
      tenant: {
        include: {
          editTags: {
            where: { active: true },
            orderBy: { name: "asc" },
          },
        },
      },
      client: {
        select: {
          id: true,
          name: true,
          businessName: true,
          watermarkUrl: true,
          watermarkSettings: true,
        },
      },
      property: { select: { name: true } },
      favorites: { select: { imageId: true } },
      editRequests: {
        where: { status: { not: "CANCELLED" } },
        select: { fileUrl: true, status: true },
      },
      booking: {
        include: {
          assignments: {
            include: {
              teamMember: { select: { displayName: true } },
            },
          },
        },
      },
    },
  });
});

function buildOptimizedBannerUrl(galleryId: string, bannerUrl: string) {
  if (!bannerUrl) return null;
  const isGoogleDrive = bannerUrl.includes("drive.google.com");
  const gDriveMatch = bannerUrl.match(/\/d\/([^/]+)/) || bannerUrl.match(/[?&]id=([^&]+)/);
  const gDriveId = gDriveMatch?.[1];

  return isGoogleDrive && gDriveId
    ? `/api/google-drive/assets/${galleryId}?id=${gDriveId}&size=w1024h768&shared=true`
    : `/api/dropbox/assets/${galleryId}?path=/&sharedLink=${encodeURIComponent(
        cleanDropboxLink(bannerUrl),
      )}&size=w1024h768&shared=true`;
}

export async function generatePublicGalleryV2Metadata({
  galleryId,
  canonicalPath,
}: {
  galleryId: string;
  canonicalPath: string;
}): Promise<Metadata> {
  const gallery = await getGalleryShell(galleryId);
  if (!gallery) return { title: "Gallery Not Found" };

  const title = gallery.title;
  const description = `Production Gallery by ${gallery.tenant.name}`;
  const optimizedBannerUrl = buildOptimizedBannerUrl(galleryId, String(gallery.bannerImageUrl || ""));

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: optimizedBannerUrl ? [{ url: optimizedBannerUrl }] : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: optimizedBannerUrl ? [optimizedBannerUrl] : [],
    },
    alternates: { canonical: canonicalPath },
  };
}

export async function PublicGalleryV2({
  galleryId,
  pageSize = V2_PAGE_SIZE,
}: {
  galleryId: string;
  pageSize?: number;
}) {
  return (
    <div className="min-h-screen bg-white">
      <Suspense fallback={null}>
        <GalleryV2DataWrapper galleryId={galleryId} pageSize={pageSize} />
      </Suspense>
    </div>
  );
}

async function GalleryV2DataWrapper({ galleryId, pageSize }: { galleryId: string; pageSize: number }) {
  const gallery = await getGalleryFull(galleryId);
  if (!gallery) notFound();

  const assetsResult = await getGalleryAssets(galleryId, pageSize);
  const initialAssets = assetsResult.success ? assetsResult.assets : [];
  const initialCursor = assetsResult.success ? assetsResult.nextCursor : null;
  const initialAssetsError = assetsResult.success ? null : (assetsResult as any)?.error || "Failed to load assets";

  const serializedEditTags = gallery.tenant.editTags.map((tag: any) => ({
    id: tag.id,
    name: tag.name,
    description: tag.description,
    cost: Number(tag.cost),
    specialistType: tag.specialistType,
  }));

  const serializedGallery = {
    id: String(gallery.id),
    tenantId: String(gallery.tenantId),
    title: String(gallery.title),
    property: String(gallery.property?.name || "TBC"),
    client: String(gallery.client?.businessName || gallery.client?.name || "Client"),
    isLocked: gallery.isLocked,
    watermarkEnabled: gallery.watermarkEnabled,
    clientBranding: gallery.client?.watermarkUrl
      ? { url: gallery.client.watermarkUrl, settings: gallery.client.watermarkSettings }
      : null,
    metadata: gallery.metadata,
    status: gallery.status,
    bannerImageUrl: gallery.bannerImageUrl ? String(gallery.bannerImageUrl) : "",
    initialFavorites: gallery.favorites.map((f: any) => f.imageId),
    initialEditRequests: gallery.editRequests.map((er: any) => ({ fileUrl: er.fileUrl, status: er.status })),
    teamMembers: gallery.booking?.assignments?.map((a: any) => a.teamMember.displayName).join(", ") || "The Team",
  };

  const serializedTenant = {
    name: String(gallery.tenant.name),
    logoUrl: gallery.tenant.logoUrl ? String(gallery.tenant.logoUrl) : null,
    brandColor: String(gallery.tenant.brandColor || "#10B981"),
    settings: gallery.tenant.settings || {},
  };

  return (
    <GalleryPublicViewerV2
      gallery={serializedGallery}
      tenant={serializedTenant}
      editTags={serializedEditTags}
      initialAssets={initialAssets}
      initialCursor={initialCursor}
      initialAssetsError={initialAssetsError}
    />
  );
}


