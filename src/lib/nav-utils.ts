import { prisma } from "@/lib/prisma";

export async function getNavCounts(tenantId: string, userId: string, role: string, agentId?: string | null, clientId?: string | null, permissions?: any) {
  let bookingWhere: any = { tenantId, deletedAt: null };
  let galleryWhere: any = { tenantId, deletedAt: null };
  let editWhere: any = { tenantId };

  if (role === "AGENT" && clientId) {
    if (!permissions?.seeAll) {
      bookingWhere.agentId = agentId;
      galleryWhere.agentId = agentId;
      editWhere.gallery = { agentId: agentId };
    } else {
      bookingWhere.clientId = clientId;
      galleryWhere.clientId = clientId;
      editWhere.clientId = clientId;
    }
  } else if (role === "CLIENT" && clientId) {
    bookingWhere.clientId = clientId;
    galleryWhere.clientId = clientId;
    editWhere.clientId = clientId;
  }

  const [pendingBookings, undeliveredGalleries, newEdits] = await Promise.all([
    prisma.booking.count({ 
      where: { 
        ...bookingWhere, 
        status: { in: ['REQUESTED', 'PENCILLED'] },
        isPlaceholder: false, // Don't count availability slots
        clientId: { not: null } // Only count real jobs
      } 
    }),
    prisma.gallery.count({ where: { ...galleryWhere, status: { in: ['DRAFT', 'READY'] } } }),
    prisma.editRequest.count({ where: { ...editWhere, status: 'NEW' } }),
  ]);

  return {
    bookings: Number(pendingBookings),
    galleries: Number(undeliveredGalleries),
    edits: Number(newEdits)
  };
}

