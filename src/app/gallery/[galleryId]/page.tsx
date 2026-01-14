import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { GalleryPublicViewer } from "@/components/modules/galleries/gallery-public-viewer";
import { formatDropboxUrl, cleanDropboxLink } from "@/lib/utils";
import { auth } from "@/auth";
import { getGalleryAssets } from "@/app/actions/storage";
import { Suspense, cache } from "react";
import { Loader2, Camera, ImageIcon } from "lucide-react";
import { Metadata } from "next";
import Image from "next/image";

// Enable ISR / Caching with 1 hour revalidation for public galleries
export const revalidate = 3600;

/**
 * Cached Gallery Shell Fetch - Minimal data for instant FCP
 */
const getGalleryShell = cache(async (galleryId: string) => {
  return await prisma.gallery.findFirst({
    where: { id: galleryId, deletedAt: null },
    include: {
      tenant: true,
      client: true
    }
  }) as any;
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
});

/**
 * Generate Dynamic Social Preview (Open Graph)
 */
export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ galleryId: string }> 
}): Promise<Metadata> {
  const { galleryId } = await params;
  const gallery = await getGalleryShell(galleryId);

  if (!gallery) return { title: "Gallery Not Found" };

  const title = gallery.title;
  const description = `Production Gallery by ${gallery.tenant.name}`;
  
  // Construct the optimized banner URL for preloading
  const bannerUrl = gallery.bannerImageUrl || "";
  const isGoogleDrive = bannerUrl.includes("drive.google.com");
  const gDriveMatch = bannerUrl.match(/\/d\/([^/]+)/) || bannerUrl.match(/[?&]id=([^&]+)/);
  const gDriveId = gDriveMatch?.[1];

  const optimizedBannerUrl = bannerUrl 
    ? (isGoogleDrive && gDriveId
        ? `/api/google-drive/assets/${galleryId}?id=${gDriveId}&size=w1024h768&shared=true`
        : `/api/dropbox/assets/${galleryId}?path=/&sharedLink=${encodeURIComponent(cleanDropboxLink(bannerUrl))}&size=w1024h768&shared=true`)
    : null;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: optimizedBannerUrl ? [{ url: optimizedBannerUrl }] : [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: optimizedBannerUrl ? [optimizedBannerUrl] : [],
    },
    // Preload the LCP image to drop LCP time significantly
    alternates: {
      canonical: `/gallery/${galleryId}`,
    },
    other: optimizedBannerUrl ? {
      "rel": "preload",
      "as": "image",
      "href": optimizedBannerUrl
    } : {}
  };
}

export default async function PublicGalleryPage({
  params
}: {
  params: Promise<{ galleryId: string }>
}) {
  const { galleryId } = await params;
  
  // 1. Fetch shell data - FAST
  const gallery = await getGalleryShell(galleryId);

  if (!gallery) {
    notFound();
  }

  // Construct optimized banner URL for shell too
  const bannerUrl = gallery.bannerImageUrl || "";
  const isGoogleDrive = bannerUrl.includes("drive.google.com");
  const gDriveMatch = bannerUrl.match(/\/d\/([^/]+)/) || bannerUrl.match(/[?&]id=([^&]+)/);
  const gDriveId = gDriveMatch?.[1];

  const optimizedBannerUrl = bannerUrl 
    ? (isGoogleDrive && gDriveId
        ? `/api/google-drive/assets/${galleryId}?id=${gDriveId}&size=w1024h768&shared=true`
        : `/api/dropbox/assets/${galleryId}?path=/&sharedLink=${encodeURIComponent(cleanDropboxLink(bannerUrl))}&size=w1024h768&shared=true`)
    : "";

  // Serialize data for shell placeholder
  const serializedShellGallery = {
    title: String(gallery.title),
    client: String(gallery.client?.businessName || gallery.client?.name || "Client"),
    bannerImageUrl: optimizedBannerUrl,
  };

  const serializedShellTenant = {
    name: String(gallery.tenant.name),
    logoUrl: gallery.tenant.logoUrl ? String(gallery.tenant.logoUrl) : null,
  };

  return (
    <div className="min-h-screen bg-white">
      <Suspense fallback={<GalleryShellPlaceholder gallery={serializedShellGallery} tenant={serializedShellTenant} />}>
        <GalleryDataWrapper galleryId={galleryId} optimizedBannerUrl={optimizedBannerUrl} />
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
        <div className="max-w-[103rem] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-slate-50 mr-2" />
            {tenant.logoUrl ? (
              <Image 
                src={tenant.logoUrl} 
                alt={tenant.name} 
                width={40}
                height={40}
                className="h-10 w-auto object-contain opacity-50 grayscale" 
              />
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
          <div className="max-w-[103rem] mx-auto relative h-[60vh] w-full overflow-hidden rounded-[48px] bg-slate-100 border border-slate-50">
            <Image 
              src={gallery.bannerImageUrl} 
              alt={gallery.title}
              fill
              priority
              className="object-cover"
              sizes="(max-width: 1280px) 100vw, 1280px"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent z-10" />
            <div className="absolute bottom-12 left-12 text-white space-y-1 z-20">
              <h2 className="text-4xl font-bold tracking-tight">{gallery.title}</h2>
              <div className="h-4 w-32 bg-white/20 rounded-full animate-pulse" />
            </div>
          </div>
        </section>
      )}

      <main className="flex-1 bg-white">
        <div className="max-w-[103rem] mx-auto px-6 py-12">
          <div className="flex items-center justify-between mb-12">
            <div className="flex gap-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 w-24 bg-slate-50 rounded-xl" />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="aspect-[3/2] rounded-[32px] bg-slate-50 animate-pulse border border-slate-100 flex items-center justify-center">
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
 * Data Wrapper that performs the heavy Prisma fetch and initial asset fetch
 */
async function GalleryDataWrapper({ 
  galleryId, 
  optimizedBannerUrl 
}: { 
  galleryId: string, 
  optimizedBannerUrl: string 
}) {
  // REMOVED: const session = await auth(); - Don't block SSR on session
  const gallery = await getGalleryFull(galleryId);
  
  if (!gallery) notFound();

  // Optimization: Fetch only first 24 assets for initial render
  const assetsResult = await getGalleryAssets(galleryId, 24);
  const initialAssets = assetsResult.success ? assetsResult.assets : [];
  const initialCursor = assetsResult.success ? assetsResult.nextCursor : null;

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
    tenantId: String(gallery.tenantId),
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
    bannerImageUrl: optimizedBannerUrl, 
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
    isConnected: !!(gallery.tenant.dropboxAccessToken || (gallery.tenant as any).googleDriveRefreshToken),
    settings: gallery.tenant.settings || {}
  };

  // session and user will be handled via client-side fetch in GalleryPublicViewer
  // this avoids blocking the entire page on auth() which can take 2s+
  
  return (
    <GalleryPublicViewer 
      gallery={serializedGallery} 
      tenant={serializedTenant} 
      editTags={serializedEditTags}
      initialAssets={initialAssets}
      initialCursor={initialCursor}
    />
  );
}
