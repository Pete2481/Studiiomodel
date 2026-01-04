import { DashboardShell } from "@/components/layout/dashboard-shell";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import Link from "next/link";
import { Building2, Plus, MoreVertical, ExternalLink, Search, RefreshCw } from "lucide-react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ImpersonateButton } from "@/components/master/impersonate-button";

export default async function MasterTenantsPage() {
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

  // FETCH REAL DATA
  const tenants = await prisma.tenant.findMany({
    include: {
      _count: {
        select: {
          bookings: true,
          memberships: true,
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <DashboardShell 
      navSections={filteredNav} 
      user={user}
      title="All Tenants"
      subtitle="Complete list of all studios and their operational status."
      isMasterMode={true}
    >
      <div className="flex flex-col gap-8">
        {/* Action Bar */}
        <div className="flex items-center justify-between">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
            <input 
              type="text" 
              placeholder="Search workspaces..." 
              className="h-12 w-80 rounded-2xl border border-slate-100 bg-white pl-11 pr-4 text-sm font-medium outline-none transition-all focus:border-slate-200 focus:ring-4 focus:ring-slate-900/5 shadow-sm"
            />
          </div>
          
          <Link href="/master/tenants/new" className="h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl px-6 font-bold text-sm transition-all flex items-center gap-2 shadow-xl shadow-slate-900/10 active:scale-95">
            <Plus className="h-4 w-4" />
            Create New Tenant
          </Link>
        </div>

        {/* Tenant Table */}
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Studio Name</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Status</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Usage</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {tenants.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center">
                    <p className="text-sm font-bold text-slate-400">No tenants registered yet.</p>
                  </td>
                </tr>
              ) : tenants.map((tenant) => (
                <tr key={tenant.id} className="group hover:bg-slate-50/30 transition-all duration-300">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all duration-300 border border-slate-100 font-bold text-xs">
                        {tenant.name.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="font-bold text-slate-900">{tenant.name}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`inline-flex items-center rounded-full px-4 py-1.5 text-[10px] font-bold tracking-widest ${
                      !tenant.deletedAt ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      {!tenant.deletedAt ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col">
                        <span className="text-[13px] font-bold text-slate-900">{tenant._count.bookings}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Bookings</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[13px] font-bold text-slate-900">{tenant._count.memberships}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Users</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <ImpersonateButton tenantId={tenant.id} />
                      <button className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-white hover:border-slate-200 hover:shadow-sm transition-all text-slate-400 hover:text-slate-900 border border-transparent">
                        <MoreVertical className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  );
}
