import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";

export async function GET(_req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { bookingId } = await params;
  if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

  const sessionUser = session.user as any;
  const tPrisma = (await getTenantPrisma()) as any;
  const canViewAll = sessionUser.role === "TENANT_ADMIN" || sessionUser.role === "ADMIN";

  const b = await tPrisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      title: true,
      startAt: true,
      endAt: true,
      status: true,
      propertyStatus: true,
      clientId: true,
      agentId: true,
      isPlaceholder: true,
      slotType: true,
      otcName: true,
      otcEmail: true,
      otcPhone: true,
      otcNotes: true,
      internalNotes: true,
      clientNotes: true,
      client: { select: { id: true, name: true, businessName: true } },
      property: { select: { id: true, name: true } },
      services: { select: { serviceId: true, service: { select: { name: true } } } },
      assignments: { select: { teamMemberId: true, teamMember: { select: { id: true, displayName: true, avatarUrl: true } } } },
    },
  });

  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { role, teamMemberId, clientId, agentId } = sessionUser;

  // Ownership check (same as range endpoints)
  let isOwned = canViewAll;
  if (!isOwned) {
    if (role === "CLIENT" && b.clientId === clientId) isOwned = true;
    else if (role === "AGENT" && b.agentId === agentId) isOwned = true;
    else if (teamMemberId && (b.assignments || []).some((a: any) => a.teamMemberId === teamMemberId)) isOwned = true;
  }

  const s = b.startAt instanceof Date && !isNaN(b.startAt.getTime()) ? b.startAt.toISOString() : null;
  const e = b.endAt instanceof Date && !isNaN(b.endAt.getTime()) ? b.endAt.toISOString() : null;
  if (!s || !e) return NextResponse.json({ error: "Invalid booking dates" }, { status: 500 });

  // Mask restricted bookings as LIMITED AVAILABILITY
  if (!isOwned && !b.isPlaceholder) {
    return NextResponse.json({
      booking: {
        id: String(b.id),
        title: "LIMITED AVAILABILITY",
        startAt: s,
        endAt: e,
        status: "blocked" as any,
        propertyStatus: "",
        client: null,
        property: { name: "RESTRICTED" },
        internalNotes: "",
        clientNotes: "",
        isPlaceholder: false,
        slotType: null,
      otcName: "",
      otcEmail: "",
      otcPhone: "",
      otcNotes: "",
        services: [],
        assignments: [],
      },
    });
  }

  let status = (b.status || "REQUESTED").toLowerCase();
  if (status === "approved") status = "confirmed";

  // For CLIENT/AGENT: hide internal blockout titles/notes (tenant-only label).
  const isClientOrAgent = role === "CLIENT" || role === "AGENT";
  const isBlocked = String(b.status || "").toUpperCase() === "BLOCKED";
  if (isClientOrAgent && isBlocked) {
    return NextResponse.json({
      booking: {
        id: String(b.id),
        title: "TIME BLOCK OUT",
        startAt: s,
        endAt: e,
        status: "blocked" as any,
        propertyStatus: "",
        clientId: null,
        agentId: null,
        client: null,
        property: { name: "UNAVAILABLE" },
        internalNotes: "",
        clientNotes: "",
        isPlaceholder: false,
        slotType: null,
        otcName: "",
        otcEmail: "",
        otcPhone: "",
        otcNotes: "",
        services: [],
        assignments: [],
      },
    });
  }

  return NextResponse.json({
    booking: {
      id: String(b.id),
      title: String(b.title || (b.isPlaceholder ? `${b.slotType} SLOT` : "Booking")),
      startAt: s,
      endAt: e,
      status: status as any,
      propertyStatus: b.propertyStatus || "",
      clientId: b.clientId ? String(b.clientId) : null,
      agentId: b.agentId ? String(b.agentId) : null,
      client: !b.client ? null : { name: String(b.client.name || ""), businessName: String(b.client.businessName || "") },
      property: !b.property ? { name: "TBC" } : { name: String(b.property.name || "TBC") },
      internalNotes: String(b.internalNotes || ""),
      clientNotes: String(b.clientNotes || ""),
      isPlaceholder: !!b.isPlaceholder,
      slotType: (b as any).slotType || null,
      otcName: (b as any).otcName ? String((b as any).otcName) : "",
      otcEmail: (b as any).otcEmail ? String((b as any).otcEmail) : "",
      otcPhone: (b as any).otcPhone ? String((b as any).otcPhone) : "",
      otcNotes: (b as any).otcNotes ? String((b as any).otcNotes) : "",
      services: (b.services || []).map((s: any) => ({ serviceId: String(s.serviceId), name: String(s.service?.name || "Unknown Service") })),
      assignments: (b.assignments || []).map((a: any) => ({
        teamMemberId: String(a.teamMemberId),
        teamMember: { displayName: String(a.teamMember?.displayName || "To assign"), avatarUrl: a.teamMember?.avatarUrl || null },
      })),
    },
  });
}


