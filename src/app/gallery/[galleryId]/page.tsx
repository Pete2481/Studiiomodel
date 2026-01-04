import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { GalleryPublicViewer } from "@/components/modules/galleries/gallery-public-viewer";
import { formatDropboxUrl } from "@/lib/utils";
import { auth } from "@/auth";
import { getGalleryAssets } from "@/app/actions/dropbox";

export const dynamic = "force-dynamic";

export default async function PublicGalleryPage({
  params
}: {
  params: Promise<{ galleryId: string }>
}) {
  const { galleryId } = await params;
  const session = await auth();

  // 1. Parallelize data fetching
  const [gallery, assetsResult] = await Promise.all([
    prisma.gallery.findUnique({
      where: { id: galleryId, deletedAt: null },
      include: {
        tenant: {
          include: {
            editTags: {
              where: { active: true },
              orderBy: { name: 'asc' }
            }
          }
        },
        client: {
          select: {
            id: true,
            name: true,
            businessName: true,
            watermarkUrl: true,
            watermarkSettings: true
          }
        },
        property: {
          select: {
            name: true
          }
        },
        favorites: {
          select: {
            imageId: true
          }
        },
        editRequests: {
          where: { status: { not: 'CANCELLED' } },
          select: {
            fileUrl: true,
            status: true
          }
        },
        booking: {
          include: {
            assignments: {
              include: {
                teamMember: {
                  select: {
                    displayName: true
                  }
                }
              }
            }
          }
        }
      }
    }),
    getGalleryAssets(galleryId)
  ]);

  if (!gallery) {
    notFound();
  }

  // 2. Prepare assets
  const initialAssets = assetsResult.success ? assetsResult.assets : [];

  // Serialize edit tags (handling Decimal)
  const serializedEditTags = gallery.tenant.editTags.map(tag => ({
    id: tag.id,
    name: tag.name,
    description: tag.description,
    cost: Number(tag.cost),
    specialistType: tag.specialistType
  }));

  // Serialize data for client component
  const serializedGallery = {
    id: String(gallery.id),
    title: String(gallery.title),
    property: String(gallery.property?.name || "TBC"),
    client: String(gallery.client?.businessName || gallery.client?.name || "Client"),
    isLocked: gallery.isLocked,
    watermarkEnabled: gallery.watermarkEnabled,
    clientBranding: gallery.client?.watermarkUrl ? {
      url: gallery.client.watermarkUrl,
      settings: gallery.client.watermarkSettings
    } : null,
    metadata: gallery.metadata,
    status: gallery.status,
    bannerImageUrl: formatDropboxUrl(gallery.bannerImageUrl || ""),
    initialFavorites: gallery.favorites.map(f => f.imageId),
    initialEditRequests: gallery.editRequests.map(er => ({
      fileUrl: er.fileUrl,
      status: er.status
    })),
    teamMembers: gallery.booking?.assignments?.map(a => a.teamMember.displayName).join(", ") || "The Team"
  };

  const serializedTenant = {
    name: String(gallery.tenant.name),
    logoUrl: gallery.tenant.logoUrl ? String(gallery.tenant.logoUrl) : null,
    brandColor: String(gallery.tenant.brandColor || "#10B981"),
    isConnected: !!gallery.tenant.dropboxAccessToken,
    settings: gallery.tenant.settings || {}
  };

  const serializedUser = session?.user ? {
    role: (session.user as any).role,
    clientId: (session.user as any).clientId,
    permissions: (session.user as any).permissions || {}
  } : null;

  return (
    <div className="min-h-screen bg-white">
      <GalleryPublicViewer 
        gallery={serializedGallery} 
        tenant={serializedTenant} 
        editTags={serializedEditTags}
        user={serializedUser}
        initialAssets={initialAssets}
      />
    </div>
  );
}

