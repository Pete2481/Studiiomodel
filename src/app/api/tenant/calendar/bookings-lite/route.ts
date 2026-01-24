import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { cached, tenantTag } from "@/lib/server-cache";

// Range-based calendar bookings fetch (LITE payload for fast card rendering)
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

  const tenantId = String(session.user.tenantId || "");
  const { role, teamMemberId, clientId, agentId } = sessionUser;

  // IMPORTANT: Use overlap logic so events that span into the range still show.
  // Cache per-tenant + user scope + range (short TTL).
  const dbBookings = await cached(
    "api:calendarBookingsLite",
    [tenantId, String(role || ""), String(teamMemberId || ""), String(clientId || ""), String(agentId || ""), startAt.toISOString(), endAt.toISOString()],
    async () => {
      const rows = await tPrisma.booking.findMany({
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
          metadata: true,
          clientId: true,
          agentId: true,
          isPlaceholder: true,
          slotType: true,
          client: { select: { id: true, name: true, businessName: true } },
          agent: { select: { id: true, name: true } },
          property: { select: { id: true, name: true } },
          assignments: { select: { teamMemberId: true, teamMember: { select: { id: true, displayName: true, avatarUrl: true } } } },
        },
      });

      return rows;
    },
    { revalidateSeconds: 30, tags: [tenantTag(tenantId), `tenant:${tenantId}:calendar`] },
  );

  const toIso = (v: any) => {
    try {
      const d = v instanceof Date ? v : new Date(v);
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    } catch {
      return null;
    }
  };

  const bookings = (dbBookings as any[])
    .map((b: any) => {
      const s = toIso(b.startAt);
      const e = toIso(b.endAt);
      if (!s || !e) return null;

      // Ownership check (same as full endpoint)
      let isOwned = canViewAll;
      if (!isOwned) {
        if (role === "CLIENT" && b.clientId === clientId) isOwned = true;
        else if (role === "AGENT" && b.agentId === agentId) isOwned = true;
        else if (teamMemberId && (b.assignments || []).some((a: any) => a.teamMemberId === teamMemberId)) isOwned = true;
      }

      // Mask restricted bookings as LIMITED AVAILABILITY (lite payload)
      if (!isOwned && !b.isPlaceholder) {
        return {
          id: String(b.id),
          title: "LIMITED AVAILABILITY",
          startAt: s,
          endAt: e,
          status: "blocked" as any,
          propertyStatus: "",
          client: null,
          agent: null,
          property: { name: "RESTRICTED" },
          isPlaceholder: false,
          slotType: null,
          teamAvatars: [] as string[],
          teamCount: 0,
        };
      }

      let status = (b.status || "REQUESTED").toLowerCase();
      if (status === "approved") status = "confirmed";
      const isClientOrAgent = role === "CLIENT" || role === "AGENT";
      const isBlocked = String(b.status || "").toUpperCase() === "BLOCKED";

      const members = (b.assignments || [])
        .map((a: any) => a?.teamMember)
        .filter(Boolean);

      const teamAvatars = members
        .map((m: any) => m?.avatarUrl)
        .filter(Boolean)
        .slice(0, 3);

      const teamMemberIds = (b.assignments || [])
        .map((a: any) => a?.teamMemberId)
        .filter(Boolean)
        .map((id: any) => String(id));

      return {
        id: String(b.id),
        title: isClientOrAgent && isBlocked ? "TIME BLOCK OUT" : String(b.title || (b.isPlaceholder ? `${b.slotType} SLOT` : "Booking")),
        startAt: s,
        endAt: e,
        status: status as any,
        propertyStatus: b.propertyStatus || "",
        client: !b.client ? null : { name: String(b.client.name || ""), businessName: String(b.client.businessName || "") },
        agent: !b.agent ? null : { name: String(b.agent.name || "") },
        property: isClientOrAgent && isBlocked ? { name: "UNAVAILABLE" } : (!b.property ? { name: "TBC" } : { name: String(b.property.name || "TBC") }),
        isPlaceholder: !!b.isPlaceholder,
        slotType: (b as any).slotType || null,
        isDraft: !!((b.metadata as any)?.draft),
        teamAvatars,
        teamCount: members.length,
        teamMemberIds,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ bookings });
}


