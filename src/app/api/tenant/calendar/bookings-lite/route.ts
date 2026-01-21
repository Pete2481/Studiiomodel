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

  // Safety: widen by +/- 1 day to avoid timezone/week-window misses.
  // (FullCalendar can provide week ranges that are exclusive/inclusive and may
  // shift when business hours/hidden days or timezone boundaries apply.)
  const rangeStart = new Date(startAt.getTime() - 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);

  const sessionUser = session.user as any;
  const tPrisma = (await getTenantPrisma()) as any;
  const canViewAll = sessionUser.role === "TENANT_ADMIN" || sessionUser.role === "ADMIN";

  const tenantId = String(session.user.tenantId || "");
  const { role, teamMemberId, clientId, agentId } = sessionUser;

  // IMPORTANT: Use overlap logic so events that span into the range still show.
  // Cache per-tenant + user scope + range (short TTL).
  const dbBookings = await cached(
    "api:calendarBookingsLite",
    [tenantId, String(role || ""), String(teamMemberId || ""), String(clientId || ""), String(agentId || ""), rangeStart.toISOString(), rangeEnd.toISOString()],
    async () =>
      await tPrisma.booking.findMany({
        where: {
          deletedAt: null,
          startAt: { lt: rangeEnd },
          endAt: { gt: rangeStart },
        },
        select: {
          id: true,
          title: true,
          startAt: true,
          endAt: true,
          status: true,
          clientId: true,
          agentId: true,
          isPlaceholder: true,
          slotType: true,
          // Keep names for calendar cards, but avoid heavy nested payloads.
          client: { select: { name: true, businessName: true } },
          property: { select: { name: true } },
          // Keep assignment ids only for ownership masking (no teamMember objects/avatars).
          assignments: { select: { teamMemberId: true } },
        },
      }),
    { revalidateSeconds: 30, tags: [tenantTag(tenantId), `tenant:${tenantId}:calendar`] },
  );

  const bookings = (dbBookings as any[])
    .map((b: any) => {
      const s = b.startAt instanceof Date && !isNaN(b.startAt.getTime()) ? b.startAt.toISOString() : null;
      const e = b.endAt instanceof Date && !isNaN(b.endAt.getTime()) ? b.endAt.toISOString() : null;
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
          property: { name: "RESTRICTED" },
          isPlaceholder: false,
          slotType: null,
          teamAvatars: [] as string[],
          teamCount: 0,
          teamMemberIds: [] as string[],
          isDraft: false,
        };
      }

      let status = (b.status || "REQUESTED").toLowerCase();
      if (status === "approved") status = "confirmed";
      const isClientOrAgent = role === "CLIENT" || role === "AGENT";
      const isBlocked = String(b.status || "").toUpperCase() === "BLOCKED";

      const teamMemberIds = (b.assignments || [])
        .map((a: any) => a?.teamMemberId)
        .filter(Boolean)
        .map((id: any) => String(id));

      const statusRaw = String(b.status || "").toUpperCase();
      // Lightweight draft heuristic (avoid pulling metadata JSON):
      // Drafts created by Calendar V2 use title "New Event" + status APPROVED.
      const isDraft = String(b.title || "").trim().toLowerCase() === "new event" && statusRaw === "APPROVED";

      return {
        id: String(b.id),
        title: isClientOrAgent && isBlocked ? "TIME BLOCK OUT" : String(b.title || (b.isPlaceholder ? `${b.slotType} SLOT` : "Booking")),
        startAt: s,
        endAt: e,
        status: status as any,
        client: !b.client ? null : { name: String(b.client.name || ""), businessName: String(b.client.businessName || "") },
        property: isClientOrAgent && isBlocked ? { name: "UNAVAILABLE" } : (!b.property ? { name: "TBC" } : { name: String(b.property.name || "TBC") }),
        isPlaceholder: !!b.isPlaceholder,
        slotType: (b as any).slotType || null,
        // NOTE: We intentionally do not include team avatars/count in the lite payload
        // to keep the response small and fast. Full details load on demand.
        teamAvatars: [] as string[],
        teamCount: 0,
        teamMemberIds,
        isDraft,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ bookings });
}


