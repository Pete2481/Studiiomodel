import { DashboardShell } from "@/components/layout/dashboard-shell";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { 
  Building2, 
  RefreshCw, 
  Pause, 
  ArrowLeftRight, 
  Trash2,
  CheckCircle2,
  Users as UsersIcon,
  Calendar as CalendarIcon,
  Image as ImageIcon,
  Plus,
  Clock,
  Activity,
  Zap
} from "lucide-react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { SubscriptionOverwriteToggle } from "@/components/master/subscription-overwrite-toggle";
import { AddAdminModal } from "@/components/master/add-admin-modal";
import { SyncAccessButton } from "@/components/master/sync-access-button";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function MasterDashboardPage() {
  await headers();
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

  // FETCH REAL DATA FROM PRISMA
  // Use raw query for Master Dashboard to ensure we get subscription data even if Prisma Client is cached
  const dbTenants: any[] = await prisma.$queryRaw`
    SELECT 
      t.*,
      (SELECT COUNT(*) FROM "Booking" b WHERE b."tenantId" = t.id) as "bookingCount",
      (SELECT COUNT(*) FROM "TenantMembership" m WHERE m."tenantId" = t.id) as "membershipCount",
      (SELECT COUNT(*) FROM "Gallery" g WHERE g."tenantId" = t.id) as "galleryCount",
      /* Best-effort activity signal (no dedicated lastActive field in schema) */
      GREATEST(
        COALESCE((SELECT MAX(b."updatedAt") FROM "Booking" b WHERE b."tenantId" = t.id), to_timestamp(0)),
        COALESCE((SELECT MAX(g."updatedAt") FROM "Gallery" g WHERE g."tenantId" = t.id), to_timestamp(0)),
        COALESCE((SELECT MAX(m."updatedAt") FROM "TenantMembership" m WHERE m."tenantId" = t.id), to_timestamp(0)),
        COALESCE(t."updatedAt", to_timestamp(0))
      ) AS "lastActiveAt"
    FROM "Tenant" t
    ORDER BY "lastActiveAt" DESC
  `;

  const tenants = dbTenants.map(t => {
    // 1. Manually map each field to ensure NO BigInts or Decimals are leaked
    return {
      id: String(t.id),
      name: String(t.name),
      slug: String(t.slug),
      contactEmail: t.contactEmail || null,
      contactPhone: t.contactPhone || null,
      subscriptionStatus: t.subscriptionStatus || null,
      subscriptionOverwrite: !!t.subscriptionOverwrite,
      bookingCount: Number(t.bookingCount || 0),
      membershipCount: Number(t.membershipCount || 0),
      galleryCount: Number(t.galleryCount || 0),
      lastActiveAt: t.lastActiveAt ? (t.lastActiveAt instanceof Date ? t.lastActiveAt.toISOString() : String(t.lastActiveAt)) : null,
      taxRate: t.taxRate ? Number(t.taxRate) : 0.1,
      revenueTarget: t.revenueTarget ? Number(t.revenueTarget) : 100000,
      settings: t.settings || {},
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      trialEndsAt: t.trialEndsAt instanceof Date ? t.trialEndsAt.toISOString() : (t.trialEndsAt ? String(t.trialEndsAt) : null),
      deletedAt: t.deletedAt ? (t.deletedAt instanceof Date ? t.deletedAt.toISOString() : String(t.deletedAt)) : null,
    };
  });

  // Calculate real metrics
  const totalTenants = tenants.length;
  const activeTenants = tenants.filter(t => !t.deletedAt).length;
  const totalUsers = await prisma.tenantMembership.count();
  const totalBookings = await prisma.booking.count();
  const totalGalleries = await prisma.gallery.count();
  const trialingTenants = tenants.filter(t => t.subscriptionStatus === 'trialing' || (!t.subscriptionStatus && t.trialEndsAt && new Date(t.trialEndsAt) > new Date() && !t.subscriptionOverwrite)).length;
  const payingTenants = tenants.filter(t => t.subscriptionStatus === 'active' || t.subscriptionOverwrite).length;

  return (
    <DashboardShell 
      navSections={filteredNav} 
      user={user}
      title="Platform Oversight"
      subtitle="Monitor network growth, subscriptions, and system performance."
      isMasterMode={true}
    >
      <div className="animate-in fade-in duration-700 space-y-12 pb-20 pt-8">
        {/* Real-time Metrics Grid (Mobile Style) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MasterStatCard title="Traffic Volume" value="--" label="Network Hits (24h)" icon={<Activity className="h-5 w-5" />} color="emerald" />
          <MasterStatCard title="Network Load" value={totalBookings.toLocaleString()} label="Total Bookings" icon={<CalendarIcon className="h-5 w-5" />} color="emerald" />
          <MasterStatCard title="Active Studios" value={activeTenants.toString()} label="Total Platforms" icon={<Building2 className="h-5 w-5" />} color="amber" />
          <MasterStatCard title="Asset Velocity" value={totalGalleries.toLocaleString()} label="Live Galleries" icon={<ImageIcon className="h-5 w-5" />} color="rose" />
        </div>

        {/* Premium Tenant List */}
        <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
            <div>
              <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Active Studios</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Tenant Management & Health</p>
            </div>
            <button className="h-10 w-10 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-900 transition-all shadow-sm">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-10 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Studio</th>
                  <th className="px-10 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Plan & Status</th>
                  <th className="px-10 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Data Points</th>
                  <th className="px-10 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tenants.map((tenant) => {
                  const trialDaysLeft = tenant.trialEndsAt ? differenceInDays(new Date(tenant.trialEndsAt), new Date()) : 0;
                  const isTrialActive = trialDaysLeft > 0;
                  const isSubActive = tenant.subscriptionStatus === 'active';

                  return (
                    <tr key={tenant.id} className="group hover:bg-slate-50/50 transition-all duration-300">
                      <td className="px-10 py-6">
                        <div className="flex items-center gap-5">
                          <div 
                            className="flex h-12 w-12 items-center justify-center rounded-2xl font-black text-sm text-white shadow-lg shadow-primary/20 shrink-0"
                            style={{ backgroundColor: (tenant.settings as any)?.brandColor || '#10b981' }}
                          >
                            {tenant.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-[15px] font-bold text-slate-900 leading-tight">{tenant.name}</p>
                            <p className="text-[11px] font-medium text-slate-400 mt-0.5">{tenant.contactEmail || "No contact email"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-6">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "inline-flex items-center rounded-full px-3 py-1 text-[9px] font-black tracking-[0.1em] border shadow-sm",
                              tenant.subscriptionOverwrite ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                              isSubActive ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
                              isTrialActive ? "bg-amber-50 text-amber-600 border-amber-100" :
                              "bg-rose-50 text-rose-600 border-rose-100"
                            )}>
                              {tenant.subscriptionOverwrite ? 'MASTER OVERWRITE' : isSubActive ? 'PRO PLAN' : isTrialActive ? 'FREE TRIAL' : 'EXPIRED'}
                            </span>
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                            {tenant.subscriptionOverwrite ? 'LIFETIME ACCESS' : isTrialActive ? `${trialDaysLeft} days remaining` : 'Subscription Active'}
                          </p>
                        </div>
                      </td>
                      <td className="px-10 py-6 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-3 text-slate-400">
                            <div className="flex items-center gap-1">
                              <CalendarIcon className="h-3 w-3" />
                              <span className="text-xs font-black text-slate-900">{Number(tenant.bookingCount)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <ImageIcon className="h-3 w-3" />
                              <span className="text-xs font-black text-slate-900">{Number(tenant.galleryCount)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <UsersIcon className="h-3 w-3" />
                              <span className="text-xs font-black text-slate-900">{Number(tenant.membershipCount)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-6 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <SubscriptionOverwriteToggle tenantId={tenant.id} initialValue={!!tenant.subscriptionOverwrite} />
                          <SyncAccessButton tenantId={tenant.id} />
                          <AddAdminModal 
                            tenantId={tenant.id} 
                            tenantName={tenant.name} 
                            defaultEmail={tenant.contactEmail} 
                          />
                          <Trash2 className="h-4 w-4 text-slate-200 hover:text-rose-500 cursor-pointer ml-2 transition-colors" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Health Section (Mobile Card Style) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm p-10 space-y-8">
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase italic tracking-tight">Cloud Infrastructure</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time status monitor</p>
            </div>
            
            <div className="space-y-4">
              <HealthItem label="DATABASE CLUSTER" status="OPTIMAL" />
              <HealthItem label="IMAGE PROCESSING API" status="ACTIVE" />
              <HealthItem label="EMAIL RELAY" status="STABLE" />
            </div>
          </div>

          <div className="bg-[#b5d0c1] rounded-[40px] shadow-2xl p-10 flex flex-col justify-between group relative overflow-hidden border border-white/60">
            <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 transition-transform duration-1000">
              <RefreshCw className="h-32 w-32 text-slate-900 animate-spin-slow" />
            </div>
            
            <div className="relative z-10 space-y-2">
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em]">Maintenance Mode</p>
              <h3 className="text-2xl font-black text-slate-900 italic tracking-tight uppercase">Platform Updates</h3>
              <p className="text-slate-700/80 text-sm font-medium leading-relaxed max-w-[240px]">
                Schedule system-wide maintenance or push global updates to all tenants.
              </p>
            </div>

            <button className="relative z-10 mt-8 h-14 bg-white/70 hover:bg-white/90 text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-slate-900/10 active:scale-95 border border-white/60">
              Launch Global Maintenance
            </button>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function MasterStatCard({ title, value, label, icon, color }: any) {
  const colors: any = {
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

function ActionButton({ icon }: any) {
  return (
    <button className="h-9 w-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200">
      {icon}
    </button>
  );
}

function HealthItem({ label, status }: any) {
  return (
    <div className="flex items-center justify-between p-6 rounded-2xl border border-slate-50 bg-slate-50/30">
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-sm font-bold text-slate-900 mt-0.5">{status}</p>
      </div>
      <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </div>
    </div>
  );
}
