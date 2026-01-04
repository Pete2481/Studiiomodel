"use server";

import { getTenantPrisma } from "@/lib/tenant-guard";
import { revalidatePath } from "next/cache";

export async function blockCalendarTime(formData: FormData) {
  const tPrisma = await getTenantPrisma();

  const title = formData.get("title") as string || "Blocked Time";
  const startAt = new Date(formData.get("startAt") as string);
  const endAt = new Date(formData.get("endAt") as string);

  const booking = await (tPrisma as any).booking.create({
    data: {
      title,
      status: "BLOCKED" as any, 
      startAt,
      endAt,
    }
  });

  revalidatePath("/tenant/bookings");
  revalidatePath("/tenant/calendar");
  revalidatePath("/");
  
  return { success: true };
}

