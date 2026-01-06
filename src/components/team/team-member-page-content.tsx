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
  ExternalLink,
  MapPin,
  CalendarDays,
  Trash2,
  Edit2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TeamMemberDrawer } from "./team-member-drawer";
import { upsertTeamMember, deleteTeamMember, joinTeamAction } from "@/app/actions/team-member";
import { UserCheck, Loader2 } from "lucide-react";

interface TeamMemberPageContentProps {
  initialMembers: any[];
  isActionLocked?: boolean;
  user?: any;
}

export function TeamMemberPageContent({ 
  initialMembers,
  isActionLocked = false,
  user
}: TeamMemberPageContentProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [members, setMembers] = useState(initialMembers);
  const [searchQuery, setSearchQuery] = useState("");
  const [isActionsOpen, setIsActionsOpen] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const isAdmin = user?.role === "TENANT_ADMIN" || user?.role === "ADMIN";
  const isAlreadyInTeam = members.some(m => m.email === user?.email);

  const handleEdit = (member: any) => {
    setSelectedMember(member);
    setIsDrawerOpen(true);
    setIsActionsOpen(null);
  };

  const handleJoinTeam = async () => {
    setIsJoining(true);
    try {
      const res = await joinTeamAction();
      if (res.success) {
        window.location.reload();
      } else {
        alert(res.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsJoining(false);
    }
  };

  const handleCreate = () => {
    if (isActionLocked) {
      window.location.href = "/tenant/settings?tab=billing";
      return;
    }
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
      // In a real app, we might use SWR or router.refresh()
      window.location.reload();
    } else {
      alert(result.error);
    }
  };

  const filteredMembers = (members || []).filter(m => {
    const name = m.name || m.displayName || "";
    const email = m.email || "";
    const role = m.role || "";
    const query = searchQuery.toLowerCase();

    return (
      name.toLowerCase().includes(query) ||
      email.toLowerCase().includes(query) ||
      role.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search team members..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ui-input w-80 pl-11 pr-20" 
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-rose-50 rounded-lg">
              <span className="text-[10px] font-bold text-rose-500 uppercase">Team</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && !isAlreadyInTeam && (
            <button 
              onClick={handleJoinTeam}
              disabled={isJoining}
              className="h-10 px-6 rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-600 font-bold text-xs flex items-center gap-2 hover:bg-emerald-100 transition-all active:scale-95 disabled:opacity-50"
            >
              {isJoining ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserCheck className="h-4 w-4" />
              )}
              Join Team
            </button>
          )}
          <button 
            onClick={handleCreate}
            className={cn(
              "ui-button-primary flex items-center gap-2 px-6",
              isActionLocked && "opacity-50 grayscale hover:grayscale-0 transition-all"
            )}
          >
            <Plus className="h-4 w-4" />
            {isActionLocked ? "Sub Required" : "New Member"}
          </button>
        </div>
      </div>

      {/* List Header */}
      <div className="hidden lg:grid lg:grid-cols-[2fr_1.5fr_1fr_1fr_0.5fr] gap-4 px-8 py-4 bg-slate-50/50 rounded-2xl border border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        <span>Photographer Profile</span>
        <span>Contact Info</span>
        <span>Stats</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>

      {/* List */}
      <div className="space-y-10">
        {["ADMIN", "PHOTOGRAPHER", "EDITOR", "ACCOUNTS"].map((role) => {
          const roleMembers = filteredMembers.filter(m => m.role === role);
          if (roleMembers.length === 0) return null;

          return (
            <div key={role} className="space-y-4">
              <div className="px-4">
                <h3 className="text-sm font-bold text-slate-900 capitalize">
                  {role === "ADMIN" ? "Admins" : role.toLowerCase() + "s"}
                </h3>
              </div>
              <div className="space-y-3">
                {roleMembers.map((member) => (
                  <div 
                    key={member.id} 
                    className="group grid grid-cols-1 lg:grid-cols-[2fr_1.5fr_1fr_1fr_0.5fr] gap-4 items-center px-8 py-5 bg-white rounded-[32px] border border-slate-100 hover:border-emerald-200 hover:shadow-xl hover:shadow-slate-100 transition-all cursor-pointer relative"
                    onClick={() => handleEdit(member)}
                  >
                    {/* Profile */}
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl overflow-hidden bg-slate-100 shrink-0 shadow-inner flex items-center justify-center">
                        {member.avatar ? (
                          <img src={member.avatar} alt={member.name} className="h-full w-full object-cover" />
                        ) : (
                          <Camera className="h-5 w-5 text-slate-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-900 truncate group-hover:text-emerald-600 transition-colors">{member.name}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">{member.role}</p>
                      </div>
                    </div>

                    {/* Contact */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <Mail className="h-3 w-3 text-slate-300" /> {member.email || "No email"}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <Phone className="h-3 w-3 text-slate-300" /> {member.phone || "No phone"}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-slate-700">{member.shoots} Jobs</p>
                      <p className="text-[10px] text-slate-400 font-medium">Top Rated</p>
                    </div>

                    {/* Status */}
                    <div>
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold border uppercase tracking-wider",
                        member.status === 'ACTIVE' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-50 text-slate-400 border-slate-100"
                      )}>
                        {member.status}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 relative">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsActionsOpen(isActionsOpen === member.id ? null : member.id);
                        }}
                        className="h-9 w-9 flex items-center justify-center rounded-full border border-slate-100 hover:bg-slate-50 text-slate-400 hover:text-slate-900 transition-all"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>

                      {isActionsOpen === member.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setIsActionsOpen(null); }} />
                          <div className="absolute right-0 top-10 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-20 animate-in fade-in zoom-in duration-150">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleEdit(member); }}
                              className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                            >
                              <Edit2 className="h-3.5 w-3.5" /> Edit Profile
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDelete(member.id); }}
                              className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Deactivate
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {filteredMembers.length === 0 && (
          <div className="py-20 text-center text-slate-400 text-sm font-medium">
            {searchQuery ? "No members match your search." : "No team members found. Click 'New Member' to get started."}
          </div>
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

