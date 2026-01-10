import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma, checkSubscriptionStatus } from "@/lib/tenant-guard";
import { formatDistanceToNow } from "date-fns";
import { EditRequestsContent } from "@/components/modules/edits/edit-requests-content";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";

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

  return (
    <div className="space-y-12">
      <ShellSettings 
        title="Edit Requests" 
        subtitle="Track client feedback, request revisions, and respond to changes." 
      />
      
      <Suspense fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      }>
        <EditDataWrapper sessionUser={sessionUser} isGlobal={isGlobal} />
      </Suspense>
    </div>
  );
}

async function EditDataWrapper({ sessionUser, isGlobal }: { sessionUser: any, isGlobal: boolean }) {
  const tPrisma = (isGlobal && sessionUser.isMasterAdmin ? prisma : await getTenantPrisma()) as any;
  const tenantId = sessionUser.tenantId;

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

  // Determine where clause based on role
  let whereClause: any = {};
  const isRestrictedRole = user.role === "EDITOR" || user.role === "TEAM_MEMBER";
  
  if (isRestrictedRole && user.teamMemberId) {
    whereClause.assignedToIds = { has: user.teamMemberId };
  } else if (user.role === "CLIENT") {
    whereClause.clientId = user.clientId;
  } else if (user.role === "AGENT") {
    if (user.permissions?.canViewAllAgencyGalleries) {
      whereClause.clientId = user.clientId;
    } else {
      whereClause.gallery = { agentId: user.agentId };
    }
  }

  // Real data fetching
  const [dbRequests, dbTags, dbTeam, isSubscribed] = await Promise.all([
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
    tPrisma.editTag.findMany({ orderBy: { name: 'asc' } }),
    tPrisma.teamMember.findMany({ where: { deletedAt: null }, orderBy: { displayName: 'asc' } }),
    checkSubscriptionStatus(tenantId)
  ]);

  const requests = dbRequests.map((r: any) => ({
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
    invoice: r.gallery.invoices[0] || null,
    selectedTags: r.selectedTags.map((st: any) => ({
      id: st.id,
      name: st.editTag.name,
      cost: isRestrictedRole ? 0 : Number(st.costAtTime),
      specialistType: st.editTag.specialistType
    })),
    totalCost: isRestrictedRole ? 0 : r.selectedTags.reduce((acc: number, st: any) => acc + Number(st.costAtTime), 0),
    important: r.metadata && (r.metadata as any).important === true,
    hasAttachments: !!r.fileUrl,
    comments: 0
  }));

  const tags = dbTags.map((t: any) => ({
    id: String(t.id),
    name: String(t.name),
    description: t.description || "",
    cost: isRestrictedRole ? 0 : Number(t.cost),
    specialistType: t.specialistType || "PHOTO",
    active: t.active
  }));

  const teamMembers = dbTeam.map((tm: any) => ({
    id: tm.id,
    name: tm.displayName,
    role: tm.role,
    avatarUrl: tm.avatarUrl
  }));

  return (
    <EditRequestsContent 
      initialRequests={requests} 
      initialTags={tags}
      teamMembers={teamMembers}
      user={user} 
      isActionLocked={!isSubscribed}
    />
  );
}
