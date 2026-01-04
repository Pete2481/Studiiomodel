import { getTenantPrisma } from "@/lib/tenant-guard";
import { BookingStatus, BookingSource } from "@prisma/client";
import { notificationService } from "./notification.service";

export class BookingService {
  private static instance: BookingService;

  private constructor() {}

  public static getInstance(): BookingService {
    if (!BookingService.instance) {
      BookingService.instance = new BookingService();
    }
    return BookingService.instance;
  }

  /**
   * Complex logic for upserting a booking, including property resolution and notifications.
   */
  async upsertBooking(tenantId: string, data: any) {
    const tPrisma = await getTenantPrisma(tenantId);
    
    const { 
      id, 
      title, 
      clientId, 
      address, 
      startAt,
      endAt,
      status, 
      serviceIds = [], 
      teamMemberIds = [],
      agentId,
      notes,
      propertyStatus,
      slotType 
    } = data;

    const isBlocked = status === 'BLOCKED' || status === 'blocked';

    // 1. Resolve Property
    let property = null;
    if (address && !isBlocked) {
      property = await tPrisma.property.findFirst({
        where: { name: address }
      });

      if (!property && address && clientId) {
        property = await tPrisma.property.create({
          data: {
            client: { connect: { id: clientId } },
            tenant: { connect: { id: tenantId } },
            name: address,
            slug: address.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
          }
        });
      }
    }

    const bookingData: any = {
      title,
      status: isBlocked ? BookingStatus.BLOCKED : (status.toUpperCase() as BookingStatus),
      startAt,
      endAt,
      internalNotes: notes || "",
      propertyStatus: propertyStatus || "",
      isPlaceholder: false,
      slotType: slotType || null,
      metadata: {},
      timezone: "Australia/Sydney",
    };

    if (clientId && !isBlocked) bookingData.client = { connect: { id: clientId } };
    else if (id) bookingData.client = { disconnect: true };

    if (property?.id && !isBlocked) bookingData.property = { connect: { id: property.id } };
    else if (id) bookingData.property = { disconnect: true };

    if (agentId && !isBlocked) bookingData.agent = { connect: { id: agentId } };
    else if (id) bookingData.agent = { disconnect: true };

    let booking;
    if (id) {
      booking = await tPrisma.booking.update({
        where: { id },
        data: {
          ...bookingData,
          services: {
            deleteMany: {},
            create: serviceIds.map((sid: string) => ({ 
              service: { connect: { id: sid } }
            }))
          },
          assignments: {
            deleteMany: {},
            create: teamMemberIds.map((tid: string) => ({ 
              tenant: { connect: { id: tenantId } },
              teamMember: { connect: { id: tid } },
              role: "PHOTOGRAPHER" 
            }))
          }
        }
      });
    } else {
      booking = await tPrisma.booking.create({
        data: {
          ...bookingData,
          services: {
            create: serviceIds.map((sid: string) => ({ 
              service: { connect: { id: sid } }
            }))
          },
          assignments: {
            create: teamMemberIds.map((tid: string) => ({ 
              tenant: { connect: { id: tenantId } },
              teamMember: { connect: { id: tid } },
              role: "PHOTOGRAPHER" 
            }))
          }
        }
      });
    }

    // 2. Handle Notifications
    if (!isBlocked) {
      try {
        if (!id) {
          await notificationService.sendNewBookingNotification(booking.id);
          if (status === "APPROVED") {
            await notificationService.sendBookingConfirmationToClient(booking.id);
            for (const tid of teamMemberIds) {
              await notificationService.sendBookingAssignmentNotification(booking.id, tid);
            }
          }
        } else if (status === "APPROVED") {
          await notificationService.sendBookingConfirmationToClient(booking.id);
          for (const tid of teamMemberIds) {
            await notificationService.sendBookingAssignmentNotification(booking.id, tid);
          }
        }
      } catch (notifError) {
        console.error("NOTIFICATION ERROR (non-blocking):", notifError);
      }
    }

    return booking;
  }
}

export const bookingService = BookingService.getInstance();

