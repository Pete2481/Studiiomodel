"use server";

import { getTenantPrisma } from "@/lib/tenant-guard";
import { revalidatePath } from "next/cache";

export async function createBooking(formData: FormData) {
  const tPrisma = await getTenantPrisma();

  const title = formData.get("title") as string;
  const clientId = formData.get("clientId") as string;
  const address = formData.get("address") as string;
  const dateStr = formData.get("date") as string;

  const client = await tPrisma.client.findFirst({
    where: { id: clientId }
  });

  if (!client) throw new Error("Client not found or access denied");

  // Simplified property logic
  let property = await tPrisma.property.findFirst({
    where: { name: address }
  });

  if (!property && address) {
    property = await (tPrisma as any).property.create({
      data: {
        clientId: clientId,
        name: address,
        slug: address.toLowerCase().replace(/\s+/g, '-'),
      }
    });
  }

  const startAt = new Date(dateStr || Date.now());
  const endAt = new Date(startAt.getTime() + 3600000); // +1 hour

  const booking = await (tPrisma as any).booking.create({
    data: {
      clientId: client.id, // Use verified client.id
      propertyId: property?.id || "",
      title: title || `Shoot for ${client.name}`,
      status: "REQUESTED",
      startAt,
      endAt,
    }
  });

  revalidatePath("/");
  revalidatePath("/tenant/bookings");

  return { success: true, bookingId: booking.id };
}

