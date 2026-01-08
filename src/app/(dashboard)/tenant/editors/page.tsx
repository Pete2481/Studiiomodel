import { cn, formatDropboxUrl } from "@/lib/utils";
import { 
  Plus, 
  Search, 
  Mail, 
  Phone, 
  MoreVertical, 
  Scissors, 
  ExternalLink,
} from "lucide-react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EditorsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  return (
    <div className="space-y-12">
      <ShellSettings 
        title="Editors Roster" 
        subtitle="Manage your post-production team, monitor turnaround times, and assign tasks." 
      />
      
      <Suspense fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      }>
        <EditorsDataWrapper session={session} />
      </Suspense>
    </div>
  );
}

async function EditorsDataWrapper({ session }: { session: any }) {
  const tenantId = session.user.tenantId;

  const dbEditors = await prisma.teamMember.findMany({
    where: { tenantId, role: 'EDITOR', deletedAt: null },
    select: { id: true, displayName: true, email: true, phone: true, status: true, avatarUrl: true },
    orderBy: { displayName: 'asc' }
  });

  const editors = dbEditors.map(e => ({ 
    id: e.id, 
    name: e.displayName, 
    email: e.email || "No email", 
    phone: e.phone || "No phone", 
    status: e.status || "ACTIVE", 
    edits: 0,
    avatar: e.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(e.displayName)}&background=random`
  }));

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="text" placeholder="Search editors..." className="ui-input w-80 pl-11" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="ui-button-primary flex items-center gap-2 px-6">
            <Plus className="h-4 w-4" />
            New Member
          </button>
        </div>
      </div>

      {/* List Header */}
      <div className="hidden lg:grid lg:grid-cols-[2fr_1.5fr_1fr_1fr_0.5fr] gap-4 px-8 py-4 bg-slate-50/50 rounded-2xl border border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        <span>Editor Profile</span>
        <span>Contact Info</span>
        <span>Stats</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>

      {/* List */}
      <div className="space-y-3">
        {editors.map((agent) => (
          <div 
            key={agent.id} 
            className="group grid grid-cols-1 lg:grid-cols-[2fr_1.5fr_1fr_1fr_0.5fr] gap-4 items-center px-8 py-5 bg-white rounded-[32px] border border-slate-100 hover:border-emerald-200 hover:shadow-xl hover:shadow-slate-100 transition-all cursor-pointer"
          >
            {/* Profile */}
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl overflow-hidden bg-slate-100 shrink-0 shadow-inner">
                <img src={formatDropboxUrl(agent.avatar)} alt={agent.name} className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-slate-900 truncate group-hover:text-emerald-600 transition-colors">{agent.name}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">Editor</p>
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <Mail className="h-3 w-3 text-slate-300" /> {agent.email}
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <Phone className="h-3 w-3 text-slate-300" /> {agent.phone}
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-slate-700">{agent.edits} Tasks</p>
              <p className="text-[10px] text-slate-400 font-medium">98% Success</p>
            </div>

            {/* Status */}
            <div>
              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-wider">
                {agent.status}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2">
              <button className="h-9 w-9 flex items-center justify-center rounded-full border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-all">
                <ExternalLink className="h-4 w-4" />
              </button>
              <button className="h-9 w-9 flex items-center justify-center rounded-full border border-slate-100 hover:bg-slate-50 text-slate-400 hover:text-slate-900 transition-all">
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {editors.length === 0 && (
          <div className="p-20 text-center bg-white rounded-[40px] border border-dashed border-slate-200">
            <Scissors className="h-12 w-12 text-slate-200 mx-auto mb-4" />
            <p className="text-sm font-bold text-slate-400">No editors registered yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
