import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { GalleryPublicViewer } from "@/components/modules/galleries/gallery-public-viewer";
import { formatDropboxUrl } from "@/lib/utils";
import { auth } from "@/auth";
import { getGalleryAssets } from "@/app/actions/dropbox";
import { Suspense } from "react";
import { Loader2, Camera, ImageIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PublicGalleryPage({
  params
}: {
  params: Promise<{ galleryId: string }>
}) {
  const { galleryId } = await params;
  const session = await auth();

  // 1. Fetch core gallery data (Shell data)
  const gallery = await prisma.gallery.findUnique({
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
  });

  if (!gallery) {
    notFound();
  }

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
      <Suspense fallback={<GalleryShellPlaceholder gallery={serializedGallery} tenant={serializedTenant} />}>
        <GalleryDataWrapper 
          galleryId={galleryId}
          serializedGallery={serializedGallery}
          serializedTenant={serializedTenant}
          serializedEditTags={serializedEditTags}
          serializedUser={serializedUser}
        />
      </Suspense>
    </div>
  );
}

/**
 * Instant Shell Placeholder
 */
function GalleryShellPlaceholder({ gallery, tenant }: any) {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-slate-50 mr-2" />
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.name} className="h-10 w-auto object-contain opacity-50 grayscale" />
            ) : (
              <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
                <Camera className="h-5 w-5" />
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">{gallery.title}</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{gallery.client}</p>
            </div>
          </div>
        </div>
      </header>

      {gallery.bannerImageUrl && (
        <section className="px-6 pt-6">
          <div className="max-w-7xl mx-auto relative h-[60vh] w-full overflow-hidden rounded-[48px] bg-slate-100 animate-pulse border border-slate-50">
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent z-10" />
            <div className="absolute bottom-12 left-12 text-white space-y-1 z-20">
              <h2 className="text-4xl font-bold tracking-tight opacity-20">{gallery.title}</h2>
              <div className="h-4 w-32 bg-slate-200/50 rounded-full" />
            </div>
          </div>
        </section>
      )}

      <main className="flex-1 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex items-center justify-between mb-12">
            <div className="flex gap-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 w-24 bg-slate-50 rounded-xl" />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="aspect-[4/3] rounded-[32px] bg-slate-50 animate-pulse border border-slate-100 flex items-center justify-center">
                <ImageIcon className="h-8 w-8 text-slate-100" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Data Wrapper that performs the heavy Dropbox fetch
 */
async function GalleryDataWrapper({ 
  galleryId, 
  serializedGallery, 
  serializedTenant, 
  serializedEditTags, 
  serializedUser 
}: any) {
  const assetsResult = await getGalleryAssets(galleryId);
  const initialAssets = assetsResult.success ? assetsResult.assets : [];

  return (
    <GalleryPublicViewer 
      gallery={serializedGallery} 
      tenant={serializedTenant} 
      editTags={serializedEditTags}
      user={serializedUser}
      initialAssets={initialAssets}
    />
  );
}

