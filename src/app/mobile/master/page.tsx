import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { 
  Building2, 
  Users, 
  Calendar, 
  Image as ImageIcon,
  CreditCard,
  Plus,
  ArrowRight,
  ShieldCheck,
  AlertCircle
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MobileMasterDashboard() {
  await headers();
  const session = await auth();

  if (!session || !session.user.isMasterAdmin) {
    redirect("/login");
  }

  // Fetch High-Level Network Stats
  const [tenantCount, userCount, bookingCount, galleryCount] = await Promise.all([
    prisma.tenant.count({ where: { deletedAt: null } }),
    prisma.tenantMembership.count(),
    prisma.booking.count(),
    prisma.gallery.count(),
  ]);

  // Fetch Latest 5 Tenants
  const latestTenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      name: true,
      slug: true,
      subscriptionStatus: true,
      brandColor: true,
      createdAt: true
    }
  });

  return (
    <div className="animate-in fade-in duration-700 pb-32 min-h-screen bg-white">
      {/* Header */}
      <div className="sticky top-12 z-[100] px-6 pt-6 pb-4 flex items-center justify-between bg-white/95 backdrop-blur-md border-b border-slate-50">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 italic uppercase">
            Platform
          </h1>
          <p className="text-sm font-bold text-indigo-500 uppercase tracking-widest">Master Control</p>
        </div>
        <Link href="/master" className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all">
          <ShieldCheck className="h-5 w-5" />
        </Link>
      </div>

      <div className="mt-8 space-y-10">
        {/* Network Hero */}
        <section className="px-6">
          <div className="relative h-[240px] w-full rounded-[40px] overflow-hidden bg-slate-950 shadow-2xl shadow-indigo-200 ring-1 ring-white/10">
            <div className="absolute inset-0 opacity-40 bg-[url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80')] bg-cover bg-center" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
            
            <div className="absolute bottom-8 left-8 right-8">
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-1">Network Capacity</p>
              <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase mb-4">
                {tenantCount} Studios Live
              </h2>
              
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="USERS" value={userCount} />
                <MiniStat label="JOBS" value={bookingCount} />
                <MiniStat label="ASSETS" value={galleryCount} />
              </div>
            </div>
          </div>
        </section>

        {/* Global Operations Quick Links */}
        <section className="px-6 space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Global Operations</h3>
          <div className="grid grid-cols-2 gap-3">
            <OpLink href="/tenant/calendar?global=true" icon={Calendar} label="Network Schedule" color="bg-amber-50 text-amber-600" />
            <OpLink href="/tenant/galleries?global=true" icon={ImageIcon} label="Asset Stream" color="bg-emerald-50 text-emerald-600" />
            <OpLink href="/master/tenants" icon={Building2} label="Studio Manager" color="bg-indigo-50 text-indigo-600" />
            <OpLink href="/tenant/reports" icon={CreditCard} label="Revenue Monitor" color="bg-rose-50 text-rose-600" />
          </div>
        </section>

        {/* Recent Onboards */}
        <section className="px-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Recent Onboards</h3>
            <Link href="/master/tenants" className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">View All</Link>
          </div>

          <div className="space-y-3">
            {latestTenants.map((tenant) => (
              <div key={tenant.id} className="p-5 rounded-[32px] bg-white border border-slate-100 shadow-sm flex items-center justify-between group active:scale-[0.98] transition-all">
                <div className="flex items-center gap-4">
                  <div 
                    className="h-12 w-12 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg"
                    style={{ backgroundColor: tenant.brandColor || '#10b981' }}
                  >
                    {tenant.name[0]}{tenant.name[1]}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900 uppercase italic">{tenant.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Joined {format(tenant.createdAt, "MMM d")}
                    </p>
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-slate-900 group-hover:text-white transition-all">
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* System Health */}
        <section className="px-6">
          <div className="p-8 rounded-[40px] bg-emerald-50 border border-emerald-100 flex items-center gap-6">
            <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center text-emerald-500 shadow-sm shrink-0">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-black text-emerald-900 uppercase italic">Network Health: Optimal</p>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-0.5">All 12 clusters performing at peak</p>
            </div>
          </div>
        </section>
      </div>

      {/* Onboard Floating Action */}
      <div className="fixed bottom-24 right-6 z-[100]">
        <Link 
          href="/master/tenants/new"
          className="h-16 w-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-200 active:scale-95 transition-all"
        >
          <Plus className="h-6 w-6" />
        </Link>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: any) {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10">
      <p className="text-[8px] font-black text-indigo-300 uppercase tracking-widest mb-0.5">{label}</p>
      <p className="text-sm font-black text-white">{value.toLocaleString()}</p>
    </div>
  );
}

function OpLink({ href, icon: Icon, label, color }: any) {
  return (
    <Link href={href} className={cn("p-4 rounded-3xl flex flex-col gap-3 transition-all active:scale-[0.98] border border-transparent hover:border-slate-100 shadow-sm", color)}>
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-black uppercase tracking-widest leading-tight">{label}</span>
    </Link>
  );
}

