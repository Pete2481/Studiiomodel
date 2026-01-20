import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { cached, tenantTag } from "@/lib/server-cache";

// Range-based calendar bookings fetch (fast initial load + background prefetch)
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "Missing start/end" }, { status: 400 });

  const startAt = new Date(start);
  const endAt = new Date(end);
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
    return NextResponse.json({ error: "Invalid start/end" }, { status: 400 });
  }

  const sessionUser = session.user as any;
  const tPrisma = (await getTenantPrisma()) as any;
  const canViewAll = sessionUser.role === "TENANT_ADMIN" || sessionUser.role === "ADMIN";

  // Fetch only what the calendar needs for rendering (details are opened via drawer).
  // IMPORTANT: Use overlap logic so events that span into the range still show (parity with old 120-day fetch).
  const tenantId = String(session.user.tenantId || "");
  const { role, teamMemberId, clientId, agentId } = sessionUser;

  const dbBookings = await cached(
    "api:calendarBookings",
    [tenantId, String(role || ""), String(teamMemberId || ""), String(clientId || ""), String(agentId || ""), startAt.toISOString(), endAt.toISOString()],
    async () =>
      await tPrisma.booking.findMany({
        where: {
          deletedAt: null,
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
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
          internalNotes: true,
          clientNotes: true,
          client: { select: { id: true, name: true, businessName: true } },
          property: { select: { id: true, name: true } },
          services: { select: { serviceId: true, service: { select: { name: true } } } },
          assignments: { select: { teamMemberId: true, teamMember: { select: { id: true, displayName: true, avatarUrl: true } } } },
        },
      }),
    { revalidateSeconds: 30, tags: [tenantTag(tenantId), `tenant:${tenantId}:calendar`] },
  );

  const bookings = (dbBookings as any[])
    .map((b: any) => {
      const s = b.startAt instanceof Date && !isNaN(b.startAt.getTime()) ? b.startAt.toISOString() : null;
      const e = b.endAt instanceof Date && !isNaN(b.endAt.getTime()) ? b.endAt.toISOString() : null;
      if (!s || !e) return null;

      // Ownership check (same as calendar page)
      let isOwned = canViewAll;
      if (!isOwned) {
        if (role === "CLIENT" && b.clientId === clientId) isOwned = true;
        else if (role === "AGENT" && b.agentId === agentId) isOwned = true;
        else if (teamMemberId && (b.assignments || []).some((a: any) => a.teamMemberId === teamMemberId)) isOwned = true;
      }

      // Mask restricted bookings as LIMITED AVAILABILITY
      if (!isOwned && !b.isPlaceholder) {
        return {
          id: String(b.id),
          title: "LIMITED AVAILABILITY",
          startAt: s,
          endAt: e,
          status: "blocked" as any,
          propertyStatus: "",
          clientId: null,
          agentId: null,
          client: null,
          property: { name: "RESTRICTED" },
          internalNotes: "",
          clientNotes: "",
          isPlaceholder: false,
          slotType: null,
          services: [],
          assignments: [],
        };
      }

      let status = (b.status || "REQUESTED").toLowerCase();
      if (status === "approved") status = "confirmed";
      const isClientOrAgent = role === "CLIENT" || role === "AGENT";
      const isBlocked = String(b.status || "").toUpperCase() === "BLOCKED";

      return {
        id: String(b.id),
        title: isClientOrAgent && isBlocked ? "TIME BLOCK OUT" : String(b.title || (b.isPlaceholder ? `${b.slotType} SLOT` : "Booking")),
        startAt: s,
        endAt: e,
        status: status as any,
        propertyStatus: b.propertyStatus || "",
        clientId: b.clientId ? String(b.clientId) : null,
        agentId: b.agentId ? String(b.agentId) : null,
        client: !b.client ? null : { name: String(b.client.name || ""), businessName: String(b.client.businessName || "") },
        property: isClientOrAgent && isBlocked ? { name: "UNAVAILABLE" } : (!b.property ? { name: "TBC" } : { name: String(b.property.name || "TBC") }),
        internalNotes: isClientOrAgent && isBlocked ? "" : String(b.internalNotes || ""),
        clientNotes: isClientOrAgent && isBlocked ? "" : String(b.clientNotes || ""),
        isPlaceholder: !!b.isPlaceholder,
        slotType: (b as any).slotType || null,
        services: (b.services || []).map((s: any) => ({ serviceId: String(s.serviceId), name: String(s.service?.name || "Unknown Service") })),
        assignments: (b.assignments || []).map((a: any) => ({
          teamMemberId: String(a.teamMemberId),
          teamMember: { displayName: String(a.teamMember?.displayName || "To assign"), avatarUrl: a.teamMember?.avatarUrl || null },
        })),
      };
    })
    .filter(Boolean);

  return NextResponse.json({ bookings });
}


