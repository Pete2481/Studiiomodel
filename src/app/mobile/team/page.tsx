import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { redirect } from "next/navigation";
import { 
  Users,
  Plus
} from "lucide-react";
import { MobileSearchButton } from "@/components/app/mobile-search-button";
import { TeamMobileContent } from "@/components/team/team-mobile-content";

export default async function AppTeamPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const tPrisma = await getTenantPrisma();

  // Fetch all team members for the tenant
  const dbTeamMembers = await tPrisma.teamMember.findMany({
    where: { 
      deletedAt: null,
    },
    orderBy: { displayName: 'asc' },
    include: {
      _count: {
        select: { bookings: true }
      }
    }
  });

  const serializedMembers = dbTeamMembers.map(m => ({
    id: String(m.id),
    name: String(m.displayName),
    email: m.email || "",
    phone: m.phone || "",
    status: "ACTIVE", // Default to active
    shoots: Number(m._count.bookings),
    avatar: m.avatarUrl || null,
    role: String(m.role),
    permissions: JSON.parse(JSON.stringify(m.permissions || {}))
  }));

  return (
    <div className="animate-in fade-in duration-700 pb-32 min-h-screen bg-white">
      {/* Locked Header */}
      <div className="sticky top-12 z-40 px-6 pt-6 pb-4 flex items-center justify-between bg-white/90 backdrop-blur-md border-b border-slate-50">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Team
          </h1>
          <p className="text-sm font-medium text-slate-400">Production crew & crew</p>
        </div>
        <div className="flex items-center gap-3">
          <MobileSearchButton />
          <button className="h-14 w-14 rounded-[24px] bg-primary text-white flex items-center justify-center shadow-xl shadow-primary/20 transition-all active:scale-95">
            <Plus className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="mt-8">
        <TeamMobileContent 
          initialMembers={serializedMembers} 
        />
      </div>
    </div>
  );
}

