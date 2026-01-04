import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { 
  Building2, 
  Users, 
  Calendar, 
  Image as ImageIcon,
  MoreVertical,
  ExternalLink,
  Search,
  Plus,
  ArrowLeft,
  ChevronRight,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MobileMasterTenantsPage() {
  await headers();
  const session = await auth();

  if (!session || !session.user.isMasterAdmin) {
    redirect("/login");
  }

  // Fetch all tenants with counts
  const tenants = await prisma.tenant.findMany({
    include: {
      _count: {
        select: {
          bookings: true,
          memberships: true,
          galleries: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="animate-in fade-in duration-700 pb-32 min-h-screen bg-white">
      {/* Header */}
      <div className="sticky top-12 z-[100] px-6 pt-6 pb-4 bg-white/95 backdrop-blur-md border-b border-slate-50">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/mobile/master" className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 active:scale-95 transition-all">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 italic uppercase">
            All Studios
          </h1>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
            <input 
              type="text" 
              placeholder="Search workspaces..." 
              className="h-12 w-full rounded-2xl border border-slate-100 bg-slate-50 pl-11 pr-4 text-sm font-medium outline-none transition-all focus:border-slate-200 focus:ring-4 focus:ring-slate-900/5"
            />
          </div>
          <Link href="/master/tenants/new" className="h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all">
            <Plus className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <div className="mt-8 space-y-4 px-6">
        {tenants.length === 0 ? (
          <div className="py-20 text-center rounded-[40px] border-2 border-dashed border-slate-100 bg-slate-50/50">
            <Building2 className="h-10 w-10 text-slate-200 mx-auto mb-4" />
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No tenants found</p>
          </div>
        ) : tenants.map((tenant) => (
          <div key={tenant.id} className="p-6 rounded-[40px] bg-white border border-slate-100 shadow-sm space-y-6 active:scale-[0.98] transition-all group">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div 
                  className="h-14 w-14 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-primary/20"
                  style={{ backgroundColor: (tenant.settings as any)?.brandColor || '#10b981' }}
                >
                  {tenant.name[0]}{tenant.name[1]}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase italic tracking-tight">{tenant.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border shadow-sm",
                      !tenant.deletedAt ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                    )}>
                      {!tenant.deletedAt ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      ID: {tenant.slug}
                    </span>
                  </div>
                </div>
              </div>
              
              <button className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 active:scale-95 transition-all">
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <TenantMiniStat label="JOBS" value={tenant._count.bookings} icon={Calendar} />
              <TenantMiniStat label="USERS" value={tenant._count.memberships} icon={Users} />
              <TenantMiniStat label="ASSETS" value={tenant._count.galleries} icon={ImageIcon} />
            </div>

            <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Registered {format(tenant.createdAt, "MMM d, yyyy")}
              </p>
              <Link 
                href={`/master/tenants/${tenant.id}`}
                className="flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest group-hover:gap-3 transition-all"
              >
                View Details
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TenantMiniStat({ label, value, icon: Icon }: any) {
  return (
    <div className="p-3 rounded-3xl bg-slate-50/50 border border-slate-100 flex flex-col items-center justify-center text-center">
      <Icon className="h-3.5 w-3.5 text-slate-300 mb-1.5" />
      <p className="text-[14px] font-black text-slate-900 leading-tight">{value}</p>
      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{label}</p>
    </div>
  );
}

