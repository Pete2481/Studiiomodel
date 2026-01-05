import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";
import { TeamMemberPageContent } from "@/components/team/team-member-page-content";

export const dynamic = "force-dynamic";

export default async function PhotographersPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    redirect("/login");
  }

  return (
    <div className="space-y-12">
      <ShellSettings 
        title="Team Members" 
        subtitle="Manage your production crew, update permissions, and keep contact info current." 
      />
      
      <Suspense fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      }>
        <TeamDataWrapper tenantId={tenantId} />
      </Suspense>
    </div>
  );
}

async function TeamDataWrapper({ tenantId }: { tenantId: string }) {
  const tPrisma = await getTenantPrisma();

  const members = await tPrisma.teamMember.findMany({
    where: { deletedAt: null },
    orderBy: { displayName: 'asc' },
    include: {
      _count: {
        select: { bookings: true }
      }
    }
  });

  const initialMembers = members.map(m => ({
    id: String(m.id),
    name: m.displayName || "",
    email: m.email || "",
    phone: m.phone || "",
    role: String(m.role || "PHOTOGRAPHER"),
    status: m.status || "ACTIVE",
    avatar: m.avatarUrl || null,
    shoots: m._count.bookings,
    calendarSecret: m.calendarSecret || "",
    permissions: m.permissions || {}
  }));

  return <TeamMemberPageContent initialMembers={initialMembers} />;
}
