"use server";

import { getTenantPrisma, getSessionTenantId, enforceSubscription } from "@/lib/tenant-guard";
import { revalidatePath } from "next/cache";
import { galleryService } from "@/server/services/gallery.service";
import { notificationService } from "@/server/services/notification.service";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { permissionService } from "@/lib/permission-service";
import { getGalleryAssets } from "@/app/actions/dropbox";
import { subDays } from "date-fns";

/**
 * Creates or updates a gallery with full production metadata.
 */
export async function upsertGallery(data: any) {
  try {
    const session = await auth();
    const tenantId = await getSessionTenantId();
    if (!session || !tenantId) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (!permissionService.can(session.user, "manageGalleries")) {
      return { success: false, error: "Permission Denied: Cannot manage galleries." };
    }

    // SECURITY: Prevent API-level bypass of the paywall
    await enforceSubscription();

    const gallery = await galleryService.upsertGallery(tenantId, data);

    revalidatePath("/tenant/galleries");
    revalidatePath("/");
    
    return {
      success: true,
      galleryId: String(gallery.id),
      gallerySummary: {
        id: String(gallery.id),
        title: String((gallery as any)?.title || ""),
        status: String((gallery as any)?.status || ""),
        clientId: (gallery as any)?.clientId ? String((gallery as any).clientId) : null,
        propertyId: (gallery as any)?.propertyId ? String((gallery as any).propertyId) : null,
        isLocked: Boolean((gallery as any)?.isLocked),
        watermarkEnabled: Boolean((gallery as any)?.watermarkEnabled),
        createdAt: (gallery as any)?.createdAt ? String((gallery as any).createdAt) : null,
      },
    };
  } catch (error: any) {
    console.error("UPSERT GALLERY ERROR:", error);
    return { success: false, error: error.message || "Failed to save gallery" };
  }
}

/**
 * Best-effort refresh of image/video counts for galleries visible to the current user.
 * This updates `gallery.metadata.imageCount` and `gallery.metadata.videoCount`.
 */
export async function refreshGalleryCounts(galleryIds: string[]) {
  try {
    const session = await auth();
    const tenantId = await getSessionTenantId();
    if (!session || !tenantId) return { success: false, error: "Unauthorized" };

    const ids = Array.isArray(galleryIds) ? galleryIds.filter(Boolean).slice(0, 12) : [];
    if (ids.length === 0) return { success: true };

    const role = (session.user as any).role;
    const clientId = (session.user as any).clientId;
    const agentId = (session.user as any).agentId;
    const canViewAllAgencyGalleries = !!(session.user as any)?.permissions?.canViewAllAgencyGalleries;

    const allowedWhere: any = { id: { in: ids }, deletedAt: null };
    if (role === "CLIENT" && clientId) {
      allowedWhere.clientId = clientId;
    } else if (role === "AGENT") {
      if (canViewAllAgencyGalleries && clientId) allowedWhere.clientId = clientId;
      else if (agentId) allowedWhere.agentId = agentId;
    }

    const galleries = await prisma.gallery.findMany({
      where: allowedWhere,
      select: { id: true, metadata: true }
    });

    for (const g of galleries) {
      const meta: any = g.metadata || {};
      const hasSource = !!(meta?.dropboxLink || (Array.isArray(meta?.imageFolders) && meta.imageFolders.length > 0));
      const missingCount = !meta?.imageCount || Number(meta.imageCount) === 0;
      if (!hasSource || !missingCount) continue;

      // Trigger Dropbox listing/count update without pulling a lot of assets.
      // getGalleryAssets will write back accurate counts via pagination.
      await getGalleryAssets(String(g.id), 1);
    }

    revalidatePath("/tenant/galleries");
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("REFRESH GALLERY COUNTS ERROR:", error);
    return { success: false, error: error.message || "Failed to refresh counts" };
  }
}

export async function deleteGallery(id: string) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (!permissionService.can(session.user, "deleteGallery")) {
      return { success: false, error: "Permission Denied: Cannot delete galleries." };
    }

    const tPrisma = await getTenantPrisma();

    await (tPrisma as any).gallery.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    revalidatePath("/tenant/galleries");
    return { success: true };
  } catch (error: any) {
    console.error("DELETE GALLERY ERROR:", error);
    return { success: false, error: error.message || "Failed to delete gallery" };
  }
}

export async function updateGalleryStatus(id: string, status: string) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (!permissionService.can(session.user, "manageGalleries")) {
      return { success: false, error: "Permission Denied: Cannot update gallery status." };
    }

    const tPrisma = await getTenantPrisma();

    const oldGallery = await (tPrisma as any).gallery.findUnique({
      where: { id },
      select: { status: true, notifyClient: true }
    });

    await (tPrisma as any).gallery.update({
      where: { id },
      data: { 
        status: status as any,
        deliveredAt: status === 'DELIVERED' ? new Date() : undefined
      }
    });

    // Handle Notifications if status changed to DELIVERED/READY and notifyClient is true
    if ((status === "DELIVERED" || status === "READY") && 
        oldGallery?.status !== status && 
        oldGallery?.notifyClient) {
      try {
        await notificationService.sendGalleryDelivery(id);
      } catch (err) {
        console.error("GALLERY NOTIF ERROR:", err);
      }
    }

    revalidatePath("/tenant/galleries");
    revalidatePath("/");
    
    return { success: true };
  } catch (error: any) {
    console.error("UPDATE GALLERY STATUS ERROR:", error);
    return { success: false, error: error.message || "Failed to update status" };
  }
}

/**
 * Triggers a manual notification email to the client for a gallery.
 */
export async function notifyGalleryClient(galleryId: string) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) return { success: false, error: "Unauthorized" };

    await notificationService.sendGalleryDelivery(galleryId);
    return { success: true };
  } catch (error: any) {
    console.error("NOTIFY GALLERY ERROR:", error);
    return { success: false, error: "Failed to send notification" };
  }
}

/**
 * Toggles a favorite status for an image in a gallery.
 * This is collaborative - anyone with the link can heart/unheart.
 */
export async function toggleFavorite(galleryId: string, imageId: string, imagePath: string) {
  try {
    // 1. Resolve tenant first
    const gallery = await prisma.gallery.findFirst({
      where: { id: galleryId, deletedAt: null },
      select: { tenantId: true, status: true }
    });

    if (!gallery) return { success: false, error: "Gallery not found" };

    const existing = await prisma.galleryFavorite.findFirst({
      where: {
        galleryId,
        imageId,
        tenantId: gallery.tenantId
      }
    });

    if (existing) {
      await prisma.galleryFavorite.delete({
        where: { id: existing.id }
      });
      
      revalidatePath(`/gallery/${galleryId}`);
      revalidatePath("/tenant/galleries");
      revalidatePath("/");
      return { success: true, action: "removed" };
    } else {
      await prisma.galleryFavorite.create({
        data: {
          galleryId,
          imageId,
          imagePath,
          tenantId: gallery.tenantId
        }
      });

      revalidatePath(`/gallery/${galleryId}`);
      revalidatePath("/tenant/galleries");
      revalidatePath("/");
      return { success: true, action: "added" };
    }
  } catch (error: any) {
    console.error("TOGGLE FAVORITE ERROR:", error);
    return { success: false, error: "Failed to update favorite" };
  }
}

/**
 * Fetches reference data needed for creating/editing galleries.
 * Deferring this from the main dashboard load significantly improves FCP.
 */
export async function getGalleryReferenceData() {
  try {
    const session = await auth();
    const tenantId = await getSessionTenantId();
    if (!session || !tenantId) return { success: false, error: "Unauthorized" };

    const canViewAll = session.user.role === "TENANT_ADMIN" || session.user.role === "ADMIN";
    const startAtGte = subDays(new Date(), 7);

    const [clients, bookings, agents, services] = await Promise.all([
      prisma.client.findMany({ 
        where: !canViewAll && (session.user as any).clientId ? { id: (session.user as any).clientId, deletedAt: null } : { tenantId, deletedAt: null }, 
        select: { id: true, name: true, businessName: true, settings: true, avatarUrl: true } 
      }),
      prisma.booking.findMany({ 
        where: {
          tenantId,
          deletedAt: null,
          isPlaceholder: false,
          startAt: { gte: startAtGte },
          // Hide bookings that already have a linked (non-deleted) gallery.
          galleries: { none: { deletedAt: null } },
          clientId: !canViewAll && (session.user as any).clientId ? (session.user as any).clientId : undefined,
        },
        orderBy: { startAt: "desc" },
        select: { 
          id: true, 
          title: true, 
          clientId: true, 
          startAt: true,
          property: { select: { name: true } }, 
          services: { include: { service: { select: { id: true, name: true, price: true } } } } 
        } 
      }),
      prisma.agent.findMany({ 
        where: !canViewAll && (session.user as any).clientId ? { clientId: (session.user as any).clientId, deletedAt: null } : { tenantId, deletedAt: null }, 
        select: { id: true, name: true, clientId: true, avatarUrl: true } 
      }),
      prisma.service.findMany({ 
        where: { tenantId, deletedAt: null }, 
        select: { id: true, name: true, price: true, icon: true } 
      }),
    ]);

    return {
      success: true,
      data: {
        clients: clients.map(c => ({ 
          id: String(c.id), 
          name: String(c.name),
          businessName: c.businessName,
          avatarUrl: c.avatarUrl,
          disabledServices: (c.settings as any)?.disabledServices || []
        })),
        bookings: bookings.map(b => ({ 
          id: String(b.id), 
          title: String(b.title), 
          clientId: String(b.clientId), 
          startAt: b.startAt ? new Date(b.startAt).toISOString() : null,
          property: { name: String(b.property?.name || "") }, 
          services: b.services.map(s => ({ 
            id: String(s.id),
            service: { id: String(s.service.id), name: String(s.service.name), price: Number(s.service.price) } 
          })) 
        })),
        agents: agents.map(a => ({ 
          id: String(a.id), 
          name: String(a.name), 
          clientId: String(a.clientId),
          avatarUrl: a.avatarUrl
        })),
        services: services.map(s => ({ 
          id: String(s.id), 
          name: String(s.name), 
          price: Number(s.price), 
          icon: s.icon 
        }))
      }
    };
  } catch (error: any) {
    console.error("REFERENCE DATA ERROR:", error);
    return { success: false, error: "Failed to load reference data" };
  }
}
