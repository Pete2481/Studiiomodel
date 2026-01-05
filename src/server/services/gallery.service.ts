import { getTenantPrisma } from "@/lib/tenant-guard";
import { notificationService } from "./notification.service";

export class GalleryService {
  private static instance: GalleryService;

  private constructor() {}

  public static getInstance(): GalleryService {
    if (!GalleryService.instance) {
      GalleryService.instance = new GalleryService();
    }
    return GalleryService.instance;
  }

  async upsertGallery(tenantId: string, data: any) {
    const tPrisma = await getTenantPrisma(tenantId);

    const { 
      id, 
      clientId, 
      bookingId, 
      agentId, 
      title, 
      status, 
      notifyClient = true, 
      isLocked = false,
      watermarkEnabled = false,
      deliveryNotes, 
      bannerImageUrl: rawBannerImageUrl, 
      serviceIds = [], 
      metadata 
    } = data;

    // SAFETY: Never store massive base64 images in the DB.
    const bannerImageUrl = (rawBannerImageUrl && rawBannerImageUrl.length > 5000) ? null : rawBannerImageUrl;

    // 1. Resolve Property
    let propertyId = "";
    if (bookingId) {
      const booking = await tPrisma.booking.findUnique({
        where: { id: bookingId },
        select: { propertyId: true }
      });
      propertyId = booking?.propertyId || "";
    }

    if (!propertyId) {
      const slug = title.toLowerCase().replace(/\s+/g, '-');
      let property = await tPrisma.property.findFirst({
        where: { slug }
      });
      
      if (!property) {
        property = await tPrisma.property.create({
          data: {
            client: { connect: { id: clientId } },
            tenant: { connect: { id: tenantId } },
            name: title,
            slug
          }
        });
      }
      propertyId = property.id;
    }

    const finalMetadata = {
      dropboxLink: metadata?.dropboxLink || "",
      imageFolders: metadata?.imageFolders || [],
      videoLinks: metadata?.videoLinks || [],
      settings: metadata?.settings || {
        loginToDownload: false,
        restrictDownloads: false
      }
    };

    const galleryData: any = {
      client: { connect: { id: clientId } },
      property: { connect: { id: propertyId } },
      tenant: { connect: { id: tenantId } },
      booking: bookingId ? { connect: { id: bookingId } } : undefined,
      agent: agentId ? { connect: { id: agentId } } : undefined,
      title,
      status: status as any,
      notifyClient,
      isLocked,
      watermarkEnabled,
      deliveryNotes,
      bannerImageUrl,
      metadata: finalMetadata,
      updatedAt: new Date(),
    };

    let gallery;
    if (id) {
      gallery = await tPrisma.gallery.update({
        where: { id },
        data: {
          ...galleryData,
          services: {
            deleteMany: {},
            create: serviceIds.map((sid: string) => ({
              service: { connect: { id: sid } }
            }))
          }
        }
      });
    } else {
      gallery = await tPrisma.gallery.create({
        data: {
          ...galleryData,
          services: {
            create: serviceIds.map((sid: string) => ({
              service: { connect: { id: sid } }
            }))
          }
        }
      });
    }

    // 2. Notifications
    if ((status === "DELIVERED" || status === "READY") && notifyClient) {
      try {
        await notificationService.sendGalleryDelivery(gallery.id);
      } catch (err) {
        console.error("GALLERY NOTIF ERROR:", err);
      }
    }

    return gallery;
  }
}

export const galleryService = GalleryService.getInstance();

