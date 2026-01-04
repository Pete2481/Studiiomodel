"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function submitPublicBooking(data: {
  tenantSlug: string;
  clientName: string;
  businessName: string;
  email: string;
  phone: string;
  shootTitle: string;
  address: string;
  date: string;
  notes: string;
}) {
  try {
    // 1. Find Tenant
    const tenant = await prisma.tenant.findUnique({
      where: { slug: data.tenantSlug },
      select: { id: true }
    });

    if (!tenant) throw new Error("Studio not found");

    // 2. Create or find Client
    // We'll try to find by email first within this tenant
    let client = await prisma.client.findFirst({
      where: {
        email: data.email,
        tenantId: tenant.id
      }
    });

    if (!client) {
      client = await prisma.client.create({
        data: {
          tenantId: tenant.id,
          name: data.clientName,
          businessName: data.businessName,
          email: data.email,
          phone: data.phone,
          status: "PENDING",
          slug: (data.businessName || data.clientName).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        }
      });
    }

    // 3. Create Property
    const propertySlug = data.shootTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    let property = await prisma.property.findFirst({
      where: { slug: propertySlug, tenantId: tenant.id }
    });

    if (!property) {
      property = await prisma.property.create({
        data: {
          tenant: { connect: { id: tenant.id } },
          client: { connect: { id: client.id } },
          name: data.shootTitle,
          slug: propertySlug,
          addressLine1: data.address
        }
      });
    }

    // 4. Create Booking (Status: REQUESTED)
    // We'll set a default time (9am) if not specified
    const startAt = new Date(data.date);
    startAt.setHours(9, 0, 0, 0);
    const endAt = new Date(startAt);
    endAt.setHours(10, 0, 0, 0); // 1 hour default

    const booking = await prisma.booking.create({
      data: {
        tenant: { connect: { id: tenant.id } },
        client: { connect: { id: client.id } },
        property: { connect: { id: property.id } },
        title: data.shootTitle,
        status: "REQUESTED",
        startAt,
        endAt,
        clientNotes: data.notes
      }
    });

    revalidatePath("/tenant/bookings");
    revalidatePath("/tenant/calendar");
    
    return { success: true, bookingId: booking.id };
  } catch (error: any) {
    console.error("PUBLIC BOOKING ERROR:", error);
    return { success: false, error: error.message || "Failed to submit booking" };
  }
}

