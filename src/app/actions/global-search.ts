"use server";

import { getTenantPrisma } from "@/lib/tenant-guard";

export type SearchResult = {
  id: string;
  type: "booking" | "gallery" | "invoice" | "client" | "editRequest";
  title: string;
  subtitle?: string;
  href: string;
};

export async function globalSearch(query: string): Promise<SearchResult[]> {
  const tPrisma = await getTenantPrisma();
  const lowerQuery = query.toLowerCase();

  const [bookings, galleries, invoices, clients, editRequests] = await Promise.all([
    // Bookings
    tPrisma.booking.findMany({
      where: {
        deletedAt: null,
        isPlaceholder: false,
        OR: [
          { title: { contains: lowerQuery, mode: 'insensitive' } },
          { description: { contains: lowerQuery, mode: 'insensitive' } },
          { property: { name: { contains: lowerQuery, mode: 'insensitive' } } },
        ],
      },
      take: 5,
      include: { property: true },
    }),
    // Galleries
    tPrisma.gallery.findMany({
      where: {
        deletedAt: null,
        title: { contains: lowerQuery, mode: 'insensitive' },
      },
      take: 5,
      select: { id: true, title: true },
    }),
    // Invoices
    tPrisma.invoice.findMany({
      where: {
        deletedAt: null,
        OR: [
          { number: { contains: lowerQuery, mode: 'insensitive' } },
          { client: { businessName: { contains: lowerQuery, mode: 'insensitive' } } },
          { client: { name: { contains: lowerQuery, mode: 'insensitive' } } },
        ],
      },
      take: 5,
      select: { id: true, number: true, client: { select: { name: true, businessName: true } } },
    }),
    // Clients
    tPrisma.client.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: lowerQuery, mode: 'insensitive' } },
          { businessName: { contains: lowerQuery, mode: 'insensitive' } },
          { email: { contains: lowerQuery, mode: 'insensitive' } },
        ],
      },
      take: 5,
      select: { id: true, name: true, businessName: true },
    }),
    // Edit Requests
    tPrisma.editRequest.findMany({
      where: {
        OR: [
          { note: { contains: lowerQuery, mode: 'insensitive' } },
          { tags: { has: lowerQuery } },
        ],
      },
      take: 5,
      select: { id: true, note: true },
    }),
  ]);

  const results: SearchResult[] = [
    ...bookings.map((b: any) => ({
      id: b.id,
      type: "booking" as const,
      title: b.title || "Untitled Booking",
      subtitle: b.property?.name || undefined,
      href: `/tenant/calendar?bookingId=${b.id}`,
    })),
    ...galleries.map((g: any) => ({
      id: g.id,
      type: "gallery" as const,
      title: g.title,
      href: `/tenant/galleries?galleryId=${g.id}`,
    })),
    ...invoices.map((i: any) => ({
      id: i.id,
      type: "invoice" as const,
      title: i.number,
      subtitle: i.client?.businessName || i.client?.name || undefined,
      href: `/tenant/invoices?invoiceId=${i.id}`,
    })),
    ...clients.map((c: any) => ({
      id: c.id,
      type: "client" as const,
      title: c.name,
      subtitle: c.businessName || undefined,
      href: `/tenant/clients?clientId=${c.id}`,
    })),
    ...editRequests.map((e: any) => ({
      id: e.id,
      type: "editRequest" as const,
      title: "Edit Request",
      subtitle: e.note.length > 40 ? e.note.substring(0, 40) + "..." : e.note,
      href: `/tenant/edits?requestId=${e.id}`,
    })),
  ];

  return results;
}

