"use server";

import { getTenantPrisma, getSessionTenantId, enforceSubscription } from "@/lib/tenant-guard";
import { revalidatePath } from "next/cache";
import { galleryService } from "@/server/services/gallery.service";
import { notificationService } from "@/server/services/notification.service";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { permissionService } from "@/lib/permission-service";

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
    
    return { success: true, galleryId: gallery.id };
  } catch (error: any) {
    console.error("UPSERT GALLERY ERROR:", error);
    return { success: false, error: error.message || "Failed to save gallery" };
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
    const gallery = await prisma.gallery.findUnique({
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
