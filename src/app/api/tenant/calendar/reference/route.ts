import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { cached, tenantTag } from "@/lib/server-cache";

// Reference data needed for the calendar drawer (clients/services/team/agents).
// Loaded client-side after first paint to keep initial calendar load fast.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionUser = session.user as any;
  const tPrisma = (await getTenantPrisma()) as any;
  const canViewAll = sessionUser.role === "TENANT_ADMIN" || sessionUser.role === "ADMIN";
  const clientId = sessionUser.clientId as string | undefined;
  const tenantId = String(session.user.tenantId || "");

  const result = await cached(
    "api:calendarReference",
    [tenantId, String(sessionUser.role || ""), String(clientId || "")],
    async () => {
      const [dbClients, dbServices, dbTeamMembers, dbAgents] = await Promise.all([
        tPrisma.client.findMany({
          where: !canViewAll && clientId ? { id: clientId, deletedAt: null } : { deletedAt: null },
          // Keep this minimal: settings JSON can be large. Disabled services will be loaded on-demand elsewhere if needed.
          select: { id: true, name: true, businessName: true, avatarUrl: true },
        }),
        tPrisma.service.findMany({
          where: { active: true },
          select: { id: true, name: true, price: true, durationMinutes: true, icon: true, slotType: true, clientVisible: true, settings: true },
        }),
        tPrisma.teamMember.findMany({
          where: { deletedAt: null },
          select: { id: true, displayName: true, avatarUrl: true },
        }),
        tPrisma.agent.findMany({
          where: !canViewAll && clientId ? { clientId, deletedAt: null } : { deletedAt: null },
          select: { id: true, name: true, clientId: true, avatarUrl: true },
        }),
      ]);

      const clients = dbClients.map((c: any) => ({
        id: String(c.id),
        name: String(c.name),
        businessName: String(c.businessName || ""),
        avatarUrl: c.avatarUrl || null,
        disabledServices: [] as string[],
      }));
      const services = dbServices.map((s: any) => ({
        id: String(s.id),
        name: String(s.name),
        price: Number(s.price),
        durationMinutes: Number(s.durationMinutes),
        icon: String(s.icon || "CAMERA"),
        slotType: (s as any).slotType || null,
        clientVisible: (s as any).clientVisible !== false,
        isFavorite: (s.settings as any)?.isFavorite || false,
      }));
      const teamMembers = dbTeamMembers.map((m: any) => ({
        id: String(m.id),
        displayName: String(m.displayName),
        avatarUrl: m.avatarUrl || null,
      }));
      const agents = dbAgents.map((a: any) => ({
        id: String(a.id),
        name: String(a.name),
        clientId: String(a.clientId),
        avatarUrl: a.avatarUrl || null,
      }));

      return { clients, services, teamMembers, agents };
    },
    { revalidateSeconds: 300, tags: [tenantTag(tenantId), `tenant:${tenantId}:calendar`] },
  );

  return NextResponse.json(result);
}


