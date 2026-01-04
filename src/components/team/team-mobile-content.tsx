"use client";

import React, { useState } from "react";
import { 
  Plus, 
  Search, 
  Mail, 
  Phone, 
  MoreVertical, 
  Camera, 
  ShieldCheck, 
  Trash2, 
  Edit2,
  ChevronRight,
  MoreHorizontal,
  Send,
  Star,
  Calendar,
  User
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TeamMemberDrawer } from "./team-member-drawer";
import { upsertTeamMember, deleteTeamMember } from "@/app/actions/team-member";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";

interface TeamMobileContentProps {
  initialMembers: any[];
}

export function TeamMobileContent({ initialMembers }: TeamMobileContentProps) {
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [members, setMembers] = useState(initialMembers);
  const [searchQuery, setSearchQuery] = useState("");
  const [isActionsOpen, setIsActionsOpen] = useState<string | null>(null);

  const handleEdit = (member: any) => {
    setSelectedMember(member);
    setIsDrawerOpen(true);
    setIsActionsOpen(null);
  };

  const handleCreate = () => {
    setSelectedMember(null);
    setIsDrawerOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to deactivate this team member?")) {
      const result = await deleteTeamMember(id);
      if (result.success) {
        setMembers(prev => prev.filter(m => m.id !== id));
      } else {
        alert(result.error);
      }
    }
    setIsActionsOpen(null);
  };

  const handleSave = async (data: any) => {
    const result = await upsertTeamMember(data);
    if (result.success) {
      setIsDrawerOpen(false);
      router.refresh();
    } else {
      alert(result.error);
    }
  };

  const filteredMembers = members.filter(m => 
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 px-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <input 
          type="text" 
          placeholder="Search production crew..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-14 bg-slate-50 border-none rounded-2xl pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-primary/20 transition-all shadow-sm" 
        />
      </div>

      {/* Member Cards grouped by role */}
      <div className="space-y-8">
        {["ADMIN", "PHOTOGRAPHER", "EDITOR", "ACCOUNTS"].map((role) => {
          const roleMembers = filteredMembers.filter(m => m.role === role);
          if (roleMembers.length === 0) return null;

          return (
            <div key={role} className="space-y-4">
              <div className="flex items-center gap-2 px-2">
                <div className="h-1 w-1 rounded-full bg-primary" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  {role === "ADMIN" ? "Admins" : role.toLowerCase() + "s"}
                </h3>
              </div>
              
              <div className="space-y-4">
                {roleMembers.map((member) => (
                  <div 
                    key={member.id}
                    className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500"
                  >
                    <div className="p-6">
                      {/* Card Header */}
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center gap-4">
                          <div className="h-14 w-14 rounded-2xl overflow-hidden bg-slate-50 shrink-0 shadow-inner ring-1 ring-slate-100 flex items-center justify-center">
                            {member.avatar ? (
                              <img src={member.avatar} alt={member.name} className="h-full w-full object-cover" />
                            ) : (
                              <Camera className="h-6 w-6 text-slate-200" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-base font-black text-slate-900 truncate leading-tight">
                              {member.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                                {member.role}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="relative">
                          <button 
                            onClick={() => setIsActionsOpen(isActionsOpen === member.id ? null : member.id)}
                            className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 active:scale-90 transition-all"
                          >
                            <MoreHorizontal className="h-5 w-5" />
                          </button>
                          
                          {isActionsOpen === member.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setIsActionsOpen(null)} />
                              <div className="absolute right-0 top-12 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-20 animate-in fade-in zoom-in duration-200">
                                <button 
                                  onClick={() => handleEdit(member)}
                                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-slate-600 active:bg-slate-50"
                                >
                                  <Edit2 className="h-4 w-4" /> Edit Profile
                                </button>
                                <button 
                                  onClick={() => router.push(`/mobile/inbox?user=${member.id}`)}
                                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-slate-600 active:bg-slate-50"
                                >
                                  <Send className="h-4 w-4" /> Message
                                </button>
                                <div className="h-px bg-slate-50 mx-2 my-1" />
                                <button 
                                  onClick={() => handleDelete(member.id)}
                                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-rose-500 active:bg-rose-50"
                                >
                                  <Trash2 className="h-4 w-4" /> Deactivate
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Contact Stats Row */}
                      <div className="grid grid-cols-2 gap-3 mb-6">
                        <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50">
                          <div className="flex items-center gap-2 text-primary mb-1">
                            <Calendar className="h-3.5 w-3.5" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Jobs Done</span>
                          </div>
                          <p className="text-xl font-black text-slate-900">{member.shoots}</p>
                        </div>
                        <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50">
                          <div className="flex items-center gap-2 text-amber-500 mb-1">
                            <Star className="h-3.5 w-3.5 fill-current" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Rating</span>
                          </div>
                          <p className="text-xl font-black text-slate-900">4.9</p>
                        </div>
                      </div>

                      {/* Quick Actions / Contact */}
                      <div className="flex gap-2">
                        <a 
                          href={`tel:${member.phone}`}
                          className={cn(
                            "flex-1 h-14 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm transition-all active:scale-95 shadow-sm",
                            member.phone ? "bg-primary text-white shadow-primary/10" : "bg-slate-50 text-slate-300 pointer-events-none"
                          )}
                        >
                          <Phone className="h-4 w-4" />
                          Call
                        </a>
                        <a 
                          href={`mailto:${member.email}`}
                          className={cn(
                            "flex-1 h-14 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm transition-all active:scale-95 shadow-sm",
                            member.email ? "bg-slate-900 text-white shadow-slate-900/10" : "bg-slate-50 text-slate-300 pointer-events-none"
                          )}
                        >
                          <Mail className="h-4 w-4" />
                          Email
                        </a>
                        <button 
                          onClick={() => handleEdit(member)}
                          className="h-14 w-14 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center active:scale-95 transition-all shadow-sm border border-slate-100"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </div>
                    </div>

                    {/* Status Footer */}
                    <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "h-2 w-2 rounded-full",
                          member.status === 'ACTIVE' ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                        )} />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                          {member.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary">
                        <ShieldCheck className="h-3 w-3" />
                        VERIFIED CREW
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {filteredMembers.length === 0 && (
          <EmptyState 
            icon={User}
            title={searchQuery ? "No crew found" : "No team members yet"}
            description={searchQuery 
              ? "Try adjusting your search filters." 
              : "Start building your production crew by adding your first photographer or editor."}
            action={!searchQuery ? {
              label: "Add Crew Member",
              onClick: handleCreate,
              icon: Plus
            } : undefined}
          />
        )}
      </div>

      <TeamMemberDrawer 
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        member={selectedMember}
        onSave={handleSave}
      />
    </div>
  );
}

