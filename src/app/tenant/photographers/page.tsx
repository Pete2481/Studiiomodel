import { DashboardShell } from "@/components/layout/dashboard-shell";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { 
  Plus, 
  Search, 
  Mail, 
  Phone, 
  MoreVertical, 
  Camera, 
  ShieldCheck, 
  ExternalLink,
  MapPin,
  CalendarDays,
  Trash2,
  Edit2
} from "lucide-react";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { checkSubscriptionStatus } from "@/lib/tenant-guard";
import { TeamMemberPageContent } from "@/components/team/team-member-page-content";
import { cn } from "@/lib/utils";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function PhotographersPage() {
  await headers();
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    redirect("/login");
  }

  const isSubscribed = await checkSubscriptionStatus(tenantId);

  const user = {
    name: session.user.name || "User",
    role: (session.user as any).role || "CLIENT",
    clientId: (session.user as any).clientId || null,
    agentId: (session.user as any).agentId || null,
    initials: session.user.name?.split(' ').map(n => n[0]).join('') || "U",
    avatarUrl: session.user.image || null,
    permissions: (session.user as any).permissions || {}
  };

  const filteredNav = permissionService.getFilteredNav(
    { role: user.role, isMasterMode: false },
    UNIFIED_NAV_CONFIG
  );

  // Real data fetching
  const [dbTeamMembers, tenant] = await Promise.all([
    prisma.teamMember.findMany({
      where: { 
        tenantId,
        deletedAt: null,
      },
      orderBy: { displayName: 'asc' },
      include: {
        _count: {
          select: { bookings: true }
        }
      }
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, logoUrl: true, brandColor: true }
    })
  ]);

  const teamMembers = dbTeamMembers.map(m => ({
    id: String(m.id),
    name: String(m.displayName),
    email: m.email || null,
    phone: m.phone || null,
    status: "ACTIVE", // Default to active for now
    shoots: Number(m._count.bookings),
    avatar: m.avatarUrl || null,
    role: String(m.role),
    permissions: m.permissions || {}
  }));

  return (
    <DashboardShell 
      navSections={filteredNav} 
      user={user}
      workspaceName={(tenant as any)?.name || "Studiio Tenant"}
      logoUrl={(tenant as any)?.logoUrl || undefined}
      brandColor={(tenant as any)?.brandColor || undefined}
      title="Team Members"
      subtitle="Manage your production crew, update permissions, and keep contact info current."
      isActionLocked={!isSubscribed}
    >
      <TeamMemberPageContent 
        initialMembers={teamMembers} 
        isActionLocked={!isSubscribed}
      />
    </DashboardShell>
  );
}

