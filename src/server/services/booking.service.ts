import { getTenantPrisma } from "@/lib/tenant-guard";
import { BookingStatus, BookingSource } from "@prisma/client";
import { notificationService } from "./notification.service";
import { calculateTravelTime, getIdealSunTime } from "./logistics.service";
import { addDays, addWeeks, addMonths } from "date-fns";

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
      otcName,
      otcEmail,
      otcPhone,
      otcNotes,
      address, 
      startAt,
      endAt,
      status, 
      serviceIds = [], 
      teamMemberIds = [],
      agentId,
      notes,
      propertyStatus,
      slotType,
      repeat = "none" 
    } = data;

    const isBlocked = status === 'BLOCKED' || status === 'blocked';

    // 0. Fetch Tenant settings for AI Logistics and constraints
    const tenant = await tPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { aiLogisticsEnabled: true, businessHours: true }
    });

    // Hard Switch: Force AI to false for now while we refactor the logic
    const isAiEnabled = false; // tenant?.aiLogisticsEnabled;
    const businessHours = tenant?.businessHours as any;

    // 0.5. Fetch service details for AI calculations
    const services = await tPrisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, slotType: true, durationMinutes: true, name: true }
    });

    // Calculate total duration for the primary booking
    const totalDuration = services.reduce((acc: number, s: any) => acc + s.durationMinutes, 0);

    // 0.6. Smart Booking Split (Dusk/Drone logic)
    let secondaryBooking = null;
    let primaryServiceIds = [...serviceIds];
    
    if (isAiEnabled && !id && !isBlocked && services.length > 1) {
      const specializedServices = services.filter((s: any) => s.slotType === "DUSK" || s.slotType === "SUNRISE");
      const standardServices = services.filter((s: any) => !s.slotType);
      
      if (specializedServices.length > 0 && standardServices.length > 0) {
        console.log(`[AI_LOGISTICS] Splitting mixed booking: ${specializedServices.length} specialized, ${standardServices.length} standard.`);
        
        // 1. Keep standard services in the primary booking
        primaryServiceIds = standardServices.map((s: any) => s.id);
        
        // 2. Prepare data for the specialized booking
        const specializedType = specializedServices[0].slotType as "DUSK" | "SUNRISE";
        
        // AUTO-PLACEMENT: Get optimal sun time for the specialized slot
        let specializedStart = startAt;
        const sunTimeResult = await getIdealSunTime(address, new Date(startAt), specializedType);
        if (sunTimeResult) {
          specializedStart = sunTimeResult.time;
          console.log(`[AI_LOGISTICS] Auto-placed ${specializedType} slot at ${specializedStart.toISOString()}`);
        }

        const specDuration = specializedServices.reduce((acc: number, s: any) => acc + s.durationMinutes, 0);
        const specializedEnd = new Date(new Date(specializedStart).getTime() + specDuration * 60000);

        secondaryBooking = {
          ...data,
          id: undefined, // Ensure it's a create
          title: `${title} (${specializedType})`,
          serviceIds: specializedServices.map((s: any) => s.id),
          slotType: specializedType,
          startAt: specializedStart,
          endAt: specializedEnd
        };
      }
    }

    // Adjust endAt based on total duration of services if AI is enabled
    let finalEndAt = endAt;
    if (isAiEnabled && !isBlocked && totalDuration > 0) {
      finalEndAt = new Date(new Date(startAt).getTime() + totalDuration * 60000);
    }

    // 0.7. Travel Time Validation
    if (isAiEnabled && !isBlocked && address && teamMemberIds.length > 0) {
      const dayStart = new Date(new Date(startAt).setHours(0, 0, 0, 0));
      const dayEnd = new Date(new Date(startAt).setHours(23, 59, 59, 999));

      const adjacentBookings = await tPrisma.booking.findMany({
        where: {
          tenantId,
          id: { not: id },
          status: { notIn: ["DECLINED", "CANCELLED"] },
          startAt: { gte: dayStart, lte: dayEnd },
          assignments: {
            some: { teamMemberId: { in: teamMemberIds } }
          }
        },
        include: {
          property: true
        },
        orderBy: { startAt: 'asc' }
      });

      for (const adj of adjacentBookings) {
        if (!adj.property?.name) continue;

        const adjStart = new Date(adj.startAt).getTime();
        const adjEnd = new Date(adj.endAt).getTime();
        const currentStart = new Date(startAt).getTime();
        const currentEnd = new Date(finalEndAt).getTime();

        const isBefore = adjEnd <= currentStart;
        const isAfter = adjStart >= currentEnd;

        if (isBefore || isAfter) {
          const origin = isBefore ? adj.property.name : address;
          const destination = isBefore ? address : adj.property.name;
          
          const travel = await calculateTravelTime(origin, destination);
          if (travel) {
            const bufferMinutes = 15;
            const requiredTimeMs = (travel.durationValue / 60 + bufferMinutes) * 60000;
            const availableTimeMs = isBefore 
              ? currentStart - adjEnd
              : adjStart - currentEnd;

            if (availableTimeMs < requiredTimeMs) {
              const reason = isBefore ? `after ${adj.title}` : `before ${adj.title}`;
              throw new Error(`Insufficient travel time ${reason}. Required: ${Math.round(requiredTimeMs / 60000)} mins (incl. buffer), Available: ${Math.round(availableTimeMs / 60000)} mins.`);
            }
          }
        }
      }
    }

    // 1. Constraint Logic for AI Logistics
    if (isAiEnabled && slotType && !isBlocked) {
      const bookingDate = new Date(startAt);
      const dayOfWeek = bookingDate.getDay();
      const config = businessHours?.[dayOfWeek.toString()];
      
      // LOGIC: Default to 1 slot if the day is open but no specific sun limit is set
      const defaultLimit = config?.open ? 1 : 0;
      const limit = slotType === "SUNRISE" 
        ? (config?.sunrise ?? defaultLimit) 
        : (slotType === "DUSK" ? (config?.dusk ?? defaultLimit) : 99);

      if (limit < 99) {
        const dayStart = new Date(new Date(bookingDate).setHours(0, 0, 0, 0));
        const dayEnd = new Date(new Date(bookingDate).setHours(23, 59, 59, 999));

        const existingCount = await tPrisma.booking.count({
          where: {
            tenantId,
            slotType,
            isPlaceholder: false, // CRITICAL: Only count real bookings, ignore system placeholders
            status: { notIn: ["DECLINED", "CANCELLED"] },
            startAt: { gte: dayStart, lte: dayEnd },
            id: { not: id } 
          }
        });

        if (existingCount >= limit) {
          throw new Error(`The daily limit for ${slotType} shoots has been reached for this day.`);
        }
      }
    }

    // OTC validation: allow bookings without a Client record, but require an OTC name.
    if (!isBlocked && !clientId && !(otcName && String(otcName).trim())) {
      throw new Error("OTC name is required when no client is selected.");
    }

    // 1. Resolve Property
    let property = null;
    if (address && !isBlocked) {
      property = await tPrisma.property.findFirst({
        where: { name: address }
      });

      if (!property && address) {
        property = await tPrisma.property.create({
          data: {
            client: clientId ? { connect: { id: clientId } } : undefined,
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
      endAt: finalEndAt,
      internalNotes: notes || "",
      propertyStatus: propertyStatus || "",
      isPlaceholder: false,
      slotType: slotType || null,
      metadata: {},
      timezone: "Australia/Sydney",
      otcName: !isBlocked && !clientId && otcName ? String(otcName) : null,
      otcEmail: !isBlocked && !clientId && otcEmail ? String(otcEmail) : null,
      otcPhone: !isBlocked && !clientId && otcPhone ? String(otcPhone) : null,
      otcNotes: !isBlocked && !clientId && otcNotes ? String(otcNotes) : null,
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
            create: primaryServiceIds.map((sid: string) => ({ 
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
            create: primaryServiceIds.map((sid: string) => ({ 
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

      // 1.5. Create Secondary Booking if split occurred
      if (secondaryBooking) {
        console.log(`[AI_LOGISTICS] Creating secondary specialized booking for ${secondaryBooking.slotType}`);
        // Recursively call upsertBooking for the secondary one
        // Note: This will not split again as secondaryBooking only has specialized services
        await this.upsertBooking(tenantId, secondaryBooking);
      }

      // Handle recurrence for Block Outs
      if (repeat !== "none" && isBlocked) {
        let iterations = 0;
        let frequency: 'day' | 'week' | 'month' = 'day';

        switch (repeat) {
          case 'daily':
            iterations = 7;
            frequency = 'day';
            break;
          case 'weekly':
            iterations = 4;
            frequency = 'week';
            break;
          case 'weekly_6m':
            iterations = 26;
            frequency = 'week';
            break;
          case 'weekly_1y':
            iterations = 52;
            frequency = 'week';
            break;
          case 'monthly_6m':
            iterations = 6;
            frequency = 'month';
            break;
          case 'monthly_1y':
            iterations = 12;
            frequency = 'month';
            break;
        }

        for (let i = 1; i < iterations; i++) {
          let nextStart = new Date(startAt);
          let nextEnd = new Date(endAt);
          
          if (frequency === 'day') {
            nextStart = addDays(nextStart, i);
            nextEnd = addDays(nextEnd, i);
          } else if (frequency === 'week') {
            nextStart = addWeeks(nextStart, i);
            nextEnd = addWeeks(nextEnd, i);
          } else if (frequency === 'month') {
            nextStart = addMonths(nextStart, i);
            nextEnd = addMonths(nextEnd, i);
          }
          
          await tPrisma.booking.create({
            data: { 
              ...bookingData, 
              startAt: nextStart, 
              endAt: nextEnd 
            }
          });
        }
      }
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

