import { DashboardShell } from "@/components/layout/dashboard-shell";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { 
  Activity, 
  TrendingUp, 
  Users, 
  Image as ImageIcon, 
  MousePointer2,
  Calendar
} from "lucide-react";
import { cn } from "@/lib/utils";

export default async function MasterReportsPage() {
  const session = await auth();

  if (!session || !session.user.isMasterAdmin) {
    redirect("/login");
  }

  const user = {
    name: session.user.name || "System Admin",
    role: "MASTER_ADMIN",
    initials: session.user.name?.split(' ').map(n => n[0]).join('') || "MA"
  };

  const filteredNav = permissionService.getFilteredNav(
    { role: user.role as any, isMasterMode: true },
    UNIFIED_NAV_CONFIG
  );

  // FETCH NETWORK VOLUMES (Operational Only)
  const totalTenants = await prisma.tenant.count({ where: { deletedAt: null } });
  const totalUsers = await prisma.tenantMembership.count();
  const totalBookings = await prisma.booking.count();
  const totalGalleries = await prisma.gallery.count();
  const totalEdits = await prisma.editRequest.count();

  return (
    <DashboardShell 
      navSections={filteredNav} 
      user={user}
      title="Network Analytics"
      subtitle="Operational volumes and system engagement metrics."
      isMasterMode={true}
    >
      <div className="animate-in fade-in duration-700 space-y-12 pb-20 pt-8">
        {/* Network Pulse Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <ReportStatCard 
            title="Active Studios" 
            value={totalTenants.toString()} 
            label="Total Ecosystem" 
            icon={<TrendingUp className="h-5 w-5" />} 
            color="indigo" 
          />
          <ReportStatCard 
            title="User Network" 
            value={totalUsers.toLocaleString()} 
            label="Total Memberships" 
            icon={<Users className="h-5 w-5" />} 
            color="emerald" 
          />
          <ReportStatCard 
            title="Booking Velocity" 
            value={totalBookings.toLocaleString()} 
            label="Historical Volume" 
            icon={<Calendar className="h-5 w-5" />} 
            color="amber" 
          />
          <ReportStatCard 
            title="Asset Load" 
            value={totalGalleries.toLocaleString()} 
            label="Live Production" 
            icon={<ImageIcon className="h-5 w-5" />} 
            color="rose" 
          />
        </div>

        {/* Chart Placeholders - Logic for real charts will follow */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-[40px] border border-slate-100 p-10 shadow-sm min-h-[400px] flex flex-col justify-between">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Traffic Pulse</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Network Hits & Engagement (Last 30 Days)</p>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 opacity-40">
                <Activity className="h-12 w-12 mx-auto text-slate-300 animate-pulse" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest italic">Hit Tracker initializing...</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[40px] border border-slate-100 p-10 shadow-sm min-h-[400px] flex flex-col justify-between">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Feature Engagement</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Popular Tools & Workflows</p>
            </div>
            <div className="flex-1 flex flex-col justify-center space-y-6">
              <EngagementBar label="Gallery Views" value={85} color="bg-indigo-500" />
              <EngagementBar label="Edit Requests" value={45} color="bg-rose-500" />
              <EngagementBar label="Social Cropper" value={30} color="bg-emerald-500" />
              <EngagementBar label="Video Notes" value={15} color="bg-amber-500" />
            </div>
          </div>
        </div>

        {/* Engagement Leaderboard (Privacy-Safe) */}
        <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-10 py-8 border-b border-slate-50 bg-slate-50/30">
            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">High Engagement Studios</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ranking by operational activity</p>
          </div>
          <div className="p-10 text-center opacity-40">
            <MousePointer2 className="h-8 w-8 mx-auto text-slate-300 mb-4" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Compiling network velocity rankings...</p>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function ReportStatCard({ title, value, label, icon, color }: any) {
  const colors: any = {
    indigo: "from-indigo-500/10 text-indigo-600 border-indigo-100",
    emerald: "from-emerald-500/10 text-emerald-600 border-emerald-100",
    amber: "from-amber-500/10 text-amber-600 border-amber-100",
    rose: "from-rose-500/10 text-rose-600 border-rose-100",
  };

  return (
    <div className={cn(
      "bg-white rounded-[40px] border p-8 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:-translate-y-1 transition-all duration-500",
      colors[color]
    )}>
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-40", colors[color].split(' ')[0])} />
      <div className="relative z-10 flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{title}</p>
          <h3 className="text-3xl font-black text-slate-900 italic tracking-tighter">{value}</h3>
        </div>
        <div className="h-10 w-10 rounded-2xl bg-white border border-slate-50 flex items-center justify-center text-slate-300 group-hover:text-primary transition-colors shadow-sm">
          {icon}
        </div>
      </div>
      <p className="relative z-10 text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-6 flex items-center gap-2">
        <span className="h-1 w-1 rounded-full bg-current animate-pulse" />
        {label}
      </p>
    </div>
  );
}

function EngagementBar({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{label}</span>
        <span className="text-[10px] font-bold text-slate-400">{value}%</span>
      </div>
      <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100">
        <div 
          className={cn("h-full rounded-full transition-all duration-[2s] ease-out", color)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

