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
        title="Studio Crew" 
        subtitle="Manage your production crew, update permissions, and keep contact info current." 
      />
      
      <Suspense fallback={<TeamSkeleton />}>
        <TeamDataWrapper tenantId={tenantId} />
      </Suspense>
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="h-10 w-64 bg-slate-100 rounded-full" />
        <div className="h-10 w-32 bg-slate-100 rounded-full" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-48 bg-slate-100 rounded-[32px]" />
        ))}
      </div>
    </div>
  );
}

async function TeamDataWrapper({ tenantId }: { tenantId: string }) {
  const session = await auth();
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

  const user = {
    email: session?.user?.email,
    role: (session?.user as any)?.role,
  };

  return <TeamMemberPageContent initialMembers={initialMembers} user={user} />;
}
