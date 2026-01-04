import { DashboardShell } from "@/components/layout/dashboard-shell";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  MessageSquare, 
  Paperclip, 
  Star, 
  CheckCircle2, 
  Clock,
  ChevronDown,
  LayoutGrid,
  List as ListIcon,
  Tag
} from "lucide-react";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma, checkSubscriptionStatus } from "@/lib/tenant-guard";
import { getNavCounts } from "@/lib/nav-utils";
import { formatDistanceToNow } from "date-fns";
import { EditRequestsContent } from "@/components/modules/edits/edit-requests-content";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditRequestsPage(props: {
  searchParams: Promise<{ global?: string }>
}) {
  await headers();
  const session = await auth();
  const searchParams = await props.searchParams;
  const isGlobal = searchParams.global === "true";

  if (!session) {
    redirect("/login");
  }

  const sessionUser = session.user as any;
  const tenantId = sessionUser.tenantId;
  if (!tenantId && !sessionUser.isMasterAdmin) {
    redirect("/login");
  }

  const tPrisma = isGlobal && sessionUser.isMasterAdmin ? prisma : await getTenantPrisma();

  const user = {
    id: sessionUser.id,
    name: sessionUser.name || "User",
    role: sessionUser.role || "CLIENT",
    teamMemberId: sessionUser.teamMemberId || null,
    agentId: sessionUser.agentId || null,
    clientId: sessionUser.clientId || null,
    initials: sessionUser.name?.split(' ').map((n: string) => n[0]).join('') || "U",
    avatarUrl: sessionUser.image || null,
    permissions: sessionUser.permissions || {}
  };

  const isSubscribed = tenantId ? await checkSubscriptionStatus(tenantId) : true;
  const navCounts = tenantId ? await getNavCounts(tenantId, sessionUser.id, user.role, user.agentId, user.clientId, user.permissions) : { bookings: 0, galleries: 0, edits: 0 };

  const filteredNav = permissionService.getFilteredNav(
    { role: user.role, isMasterMode: false },
    UNIFIED_NAV_CONFIG
  );

  // Determine where clause based on role
  let whereClause: any = {};
  const isRestrictedRole = user.role === "EDITOR" || user.role === "TEAM_MEMBER";
  
  if (isRestrictedRole && user.teamMemberId) {
    whereClause.assignedToIds = { has: user.teamMemberId };
  }

  // Real data fetching
  const [dbRequests, dbTags, dbTeam, tenant] = await Promise.all([
    tPrisma.editRequest.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { name: true, businessName: true } },
        gallery: {
          include: { 
            property: { select: { name: true } },
            invoices: {
              where: { deletedAt: null },
              select: { id: true, status: true, number: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        },
        selectedTags: {
          include: { editTag: { select: { name: true, specialistType: true } } }
        }
      }
    }),
    tPrisma.editTag.findMany({
      orderBy: { name: 'asc' }
    }),
    tPrisma.teamMember.findMany({
      where: { deletedAt: null },
      orderBy: { displayName: 'asc' }
    }),
    tPrisma.tenant.findUnique({
      where: { id: session.user.tenantId as string },
      select: { id: true, name: true, logoUrl: true, brandColor: true }
    })
  ]);

  const requests = dbRequests.map(r => ({
    id: String(r.id),
    galleryId: String(r.galleryId),
    title: r.note ? String(r.note.split('\n')[0]) : "Edit Request",
    note: r.note,
    property: String(r.gallery.property.name),
    client: String(r.client?.businessName || r.client?.name || "Unknown"),
    status: String(r.status),
    timestamp: formatDistanceToNow(new Date(r.createdAt), { addSuffix: true }),
    fileUrl: r.fileUrl,
    thumbnailUrl: r.thumbnailUrl || r.fileUrl,
    metadata: r.metadata,
    assignedToIds: r.assignedToIds || [],
    invoice: r.gallery.invoices[0] || null, // Pass invoice through
    selectedTags: r.selectedTags.map(st => ({
      id: st.id,
      name: st.editTag.name,
      cost: isRestrictedRole ? 0 : Number(st.costAtTime),
      specialistType: st.editTag.specialistType
    })),
    totalCost: isRestrictedRole ? 0 : r.selectedTags.reduce((acc, st) => acc + Number(st.costAtTime), 0),
    important: r.metadata && (r.metadata as any).important === true,
    hasAttachments: !!r.fileUrl,
    comments: 0
  }));

  const tags = dbTags.map(t => ({
    id: String(t.id),
    name: String(t.name),
    description: t.description || "",
    cost: isRestrictedRole ? 0 : Number(t.cost),
    specialistType: t.specialistType || "PHOTO",
    active: t.active
  }));

  const teamMembers = dbTeam.map(tm => ({
    id: tm.id,
    name: tm.displayName,
    role: tm.role,
    avatarUrl: tm.avatarUrl
  }));

  return (
    <DashboardShell 
      navSections={filteredNav} 
      user={user}
      workspaceName={(tenant as any)?.name || "Studiio Tenant"}
      logoUrl={(tenant as any)?.logoUrl || undefined}
      brandColor={(tenant as any)?.brandColor || undefined}
      title="Edit Requests"
      subtitle="Track client feedback, request revisions, and respond to changes."
      isActionLocked={!isSubscribed}
      navCounts={navCounts}
    >
      <EditRequestsContent 
        initialRequests={requests} 
        initialTags={tags}
        teamMembers={teamMembers}
        user={user} 
        isActionLocked={!isSubscribed}
      />
    </DashboardShell>
  );
}
