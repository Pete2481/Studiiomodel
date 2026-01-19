"use server";

import { getTenantPrisma, getSessionTenantId } from "@/lib/tenant-guard";
import { revalidatePath } from "next/cache";
import { startOfDay, endOfDay, setHours, setMinutes, addMinutes, subMinutes, format } from "date-fns";
import { getWeatherData } from "./weather";
import { auth } from "@/auth";

export async function toggleSlotPlaceholder(data: {
  date: Date;
  slotType: "SUNRISE" | "DUSK";
  action: "ADD" | "REMOVE";
}) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "TENANT_ADMIN" && role !== "ADMIN")) {
      return { success: false, error: "Permission denied." };
    }

    const tPrisma = await getTenantPrisma();
    const tenantId = await getSessionTenantId();

    const dateStart = startOfDay(new Date(data.date));
    const dateEnd = endOfDay(new Date(data.date));

    if (data.action === "REMOVE") {
      // Find and delete the placeholder for this day and type
      await (tPrisma as any).booking.deleteMany({
        where: {
          slotType: data.slotType,
          isPlaceholder: true,
          startAt: {
            gte: dateStart,
            lte: dateEnd
          }
        }
      });
    } else {
      // DEPRECATED: Calendar V2 generates Sunrise/Dusk placeholders dynamically based on Business Hours Max AM/PM.
      // Creating DB placeholder bookings causes duplicates on the V2 calendar.
      return {
        success: false,
        error: "Daily overrides are deprecated. Use Business Hours Max AM/PM (Sunrise/Dusk counters) instead.",
      };
      /*
      // Get tenant settings and real weather if possible
      const tenant = await (tPrisma as any).tenant.findUnique({
        where: { id: tenantId },
        select: { 
          sunriseSlotTime: true, 
          duskSlotTime: true,
          latitude: true,
          longitude: true
        }
      });

      const dateStr = format(dateStart, "yyyy-MM-dd");
      let midpoint: Date;

      // Try real weather first
      const weather = await getWeatherData(
        Number(tenant?.latitude || -28.8333), 
        Number(tenant?.longitude || 153.4333), 
        dateStr, 
        dateStr
      );

      if (weather.success && weather.daily) {
        const timeStr = data.slotType === "SUNRISE" ? weather.daily.sunrise[0] : weather.daily.sunset[0];
        midpoint = new Date(timeStr);
      } else {
        // Fallback to manual tenant settings
        const timeStr = data.slotType === "SUNRISE" ? tenant?.sunriseSlotTime || "06:00" : tenant?.duskSlotTime || "18:30";
        const [hours, minutes] = timeStr.split(':').map(Number);
        midpoint = setMinutes(setHours(dateStart, hours), minutes);
      }
      
      // Center the 60 min slot (30 before, 30 after)
      const slotStart = subMinutes(midpoint, 30);
      const slotEnd = addMinutes(midpoint, 30);

      const [defaultClient, defaultProperty] = await Promise.all([
        (tPrisma as any).client.findFirst({}),
        (tPrisma as any).property.findFirst({})
      ]);

      if (!defaultClient || !defaultProperty) {
        return { success: false, error: "Need at least one client and property to create placeholders" };
      }

      await (tPrisma as any).booking.create({
        data: {
          clientId: defaultClient.id,
          propertyId: defaultProperty.id,
          title: `${data.slotType} SLOT`,
          startAt: slotStart,
          endAt: slotEnd,
          isPlaceholder: true,
          slotType: data.slotType,
          status: "PENCILLED"
        }
      });
      */
    }

    revalidatePath("/tenant/calendar");
    revalidatePath("/tenant/calendar-v2");
    revalidatePath("/tenant/bookings");
    return { success: true };
  } catch (error: any) {
    console.error("TOGGLE SLOT ERROR:", error);
    return { success: false, error: error.message };
  }
}

export async function updateSlotSettings(data: {
  sunriseSlotTime: string;
  duskSlotTime: string;
  sunriseSlotsPerDay: number;
  duskSlotsPerDay: number;
}) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "TENANT_ADMIN" && role !== "ADMIN")) {
      return { success: false, error: "Permission denied." };
    }

    const tPrisma = await getTenantPrisma();
    const tenantId = await getSessionTenantId();

    await (tPrisma as any).tenant.update({
      where: { id: tenantId },
      data: {
        sunriseSlotTime: data.sunriseSlotTime,
        duskSlotTime: data.duskSlotTime,
        sunriseSlotsPerDay: data.sunriseSlotsPerDay,
        duskSlotsPerDay: data.duskSlotsPerDay
      }
    });

    revalidatePath("/tenant/calendar");
    revalidatePath("/tenant/calendar-v2");
    revalidatePath("/tenant/settings");
    return { success: true };
  } catch (error: any) {
    console.error("UPDATE SLOT SETTINGS ERROR:", error);
    return { success: false, error: error.message };
  }
}

export async function cleanupLegacySunPlaceholders() {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "TENANT_ADMIN" && role !== "ADMIN")) {
      return { success: false, error: "Permission denied." };
    }

    const tPrisma = await getTenantPrisma();
    await getSessionTenantId(); // ensure tenant context exists

    const res = await (tPrisma as any).booking.deleteMany({
      where: {
        isPlaceholder: true,
        slotType: { in: ["SUNRISE", "DUSK"] },
      },
    });

    revalidatePath("/tenant/calendar");
    revalidatePath("/tenant/calendar-v2");
    revalidatePath("/tenant/bookings");

    return { success: true, deletedCount: Number(res?.count || 0) };
  } catch (error: any) {
    console.error("CLEANUP LEGACY SUN PLACEHOLDERS ERROR:", error);
    return { success: false, error: error.message || "Failed to cleanup placeholders." };
  }
}

