"use server";

import { getTenantPrisma, getSessionTenantId, enforceSubscription } from "@/lib/tenant-guard";
import { revalidatePath } from "next/cache";
import { bookingService } from "@/server/services/booking.service";
import { auth } from "@/auth";
import { permissionService } from "@/lib/permission-service";

export async function upsertBooking(data: any) {
  try {
    const session = await auth();
    const tenantId = await getSessionTenantId();
    if (!session || !tenantId) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (!permissionService.can(session.user, "viewBookings")) {
      return { success: false, error: "Permission Denied: Cannot manage bookings." };
    }

    // SECURITY: Prevent API-level bypass of the paywall
    await enforceSubscription();

    const startAt = data.startAt ? new Date(data.startAt) : new Date(`${data.date}T${data.startTime}:00`);
    const endAt = data.endAt ? new Date(data.endAt) : new Date(startAt.getTime() + (parseFloat(data.duration || "1") * 60 * 60 * 1000));

    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      return { success: false, error: "Invalid start or end date format." };
    }

    const booking = await bookingService.upsertBooking(tenantId, {
      ...data,
      startAt,
      endAt
    });

    revalidatePath("/tenant/bookings");
    revalidatePath("/tenant/calendar");
    revalidatePath("/");
    
    return { success: true, bookingId: String(booking.id) };
  } catch (error: any) {
    console.error("UPSERT ERROR:", error);
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}

export async function deleteBooking(id: string) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (!permissionService.can(session.user, "viewBookings")) {
      return { success: false, error: "Permission Denied: Cannot delete bookings." };
    }

    const tPrisma = await getTenantPrisma();

    // Soft delete (automatically handled by tPrisma where)
    await tPrisma.booking.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: "CANCELLED"
      }
    });

    revalidatePath("/tenant/bookings");
    revalidatePath("/tenant/calendar");
    revalidatePath("/");
    
    return { success: true };
  } catch (error: any) {
    console.error("DELETE ERROR:", error);
    return { success: false, error: error.message || "Failed to delete booking." };
  }
}
