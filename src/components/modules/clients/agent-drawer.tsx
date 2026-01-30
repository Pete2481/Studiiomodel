"use client";

import React, { useState, useEffect } from "react";
import { X, User, Camera, Trash2, Check, Phone, Mail, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { upsertAgent, deleteAgent } from "@/app/actions/agent";
import { formatDropboxUrl } from "@/lib/utils";
import { enableAgentPortalAccess, setAgentPortalPassword } from "@/app/actions/password";

interface AgentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserRole?: string;
  clientId: string;
  agencyName: string;
  agents: any[];
  onRefresh: () => void;
  initialAgent?: any;
}

export function AgentDrawer({ 
  isOpen, 
  onClose, 
  currentUserRole,
  clientId, 
  agencyName, 
  agents,
  onRefresh,
  initialAgent
}: AgentDrawerProps) {
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    avatarUrl: "",
    status: "ACTIVE",
    settings: { seeAll: false }
  });

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) setMounted(true);
    else {
      // Reset when closed
      setSelectedAgent(null);
      setShowForm(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && initialAgent) {
      setSelectedAgent(initialAgent);
      setShowForm(true);
    }
  }, [initialAgent, isOpen]);

  useEffect(() => {
    if (selectedAgent) {
      setFormData({
        name: selectedAgent.name || "",
        email: selectedAgent.email || "",
        phone: selectedAgent.phone || "",
        avatarUrl: selectedAgent.avatarUrl || "",
        status: selectedAgent.status || "ACTIVE",
        settings: selectedAgent.settings || { seeAll: false }
      });
    } else {
      setFormData({
        name: "",
        email: "",
        phone: "",
        avatarUrl: "",
        status: "ACTIVE",
        settings: { seeAll: false }
      });
    }
  }, [selectedAgent]);

  if (!mounted) return null;

  const promptForImageLink = (title: string, current?: string) => {
    if (typeof window === "undefined") return null;
    const next = window.prompt(title, current || "");
    if (next === null) return null;
    return next.trim();
  };

  const setAvatarUrl = (raw: string) => {
    const v = String(raw || "").trim();
    setFormData((prev) => ({ ...prev, avatarUrl: v }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await upsertAgent({
        id: selectedAgent?.id,
        clientId,
        ...formData
      });
      if (result.success) {
        setSelectedAgent(null);
        setShowForm(false);
        onRefresh();
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure? This contact will be removed.")) return;
    const result = await deleteAgent(id);
    if (result.success) {
      onRefresh();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px] transition-all duration-500 ease-in-out",
          isOpen ? "opacity-100 visible" : "opacity-0 pointer-events-none invisible"
        )}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className={cn(
        "fixed inset-y-0 right-0 z-[101] w-full max-w-[540px] bg-white shadow-2xl flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        
        {/* Header */}
        <div className="px-10 py-8 flex items-start justify-between border-b border-slate-50">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">
              AGENCY CONTACTS
            </p>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {agencyName}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-10 py-8 space-y-8 custom-scrollbar">
          
          {showForm ? (
            <form onSubmit={handleSubmit} className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-6">
                <div className="relative group">
                  <div className="h-24 w-24 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden transition-colors group-hover:border-primary/50">
                    {formData.avatarUrl ? (
                      <img
                        src={formatDropboxUrl(formData.avatarUrl)}
                        className="h-full w-full object-cover"
                        alt="Preview"
                      />
                    ) : (
                      <Camera className="h-8 w-8 text-slate-300 group-hover:text-primary transition-colors" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const url = promptForImageLink(
                        "Paste a public image link (https) or Dropbox image link:",
                        formData.avatarUrl,
                      );
                      if (!url) return;
                      setAvatarUrl(url);
                    }}
                    className="absolute -bottom-2 -right-2 h-10 w-10 bg-primary rounded-2xl text-white flex items-center justify-center shadow-lg hover:opacity-90 transition-all active:scale-95 border-2 border-white"
                    title="Paste image link"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-slate-900">Profile Picture</h3>
                  <p className="text-xs text-slate-400">Paste a public image link (https) or Dropbox link.</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avatar image link</label>
                  <input
                    value={formData.avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    type="url"
                    placeholder="https://…"
                    className="ui-input-tight"
                  />
                  <p className="text-[11px] font-semibold text-slate-400">
                    Uploads are disabled — use a direct `https://` image URL or a public Dropbox link.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Full Name</label>
                  <input 
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    type="text" 
                    placeholder="e.g. John Smith" 
                    className="ui-input-tight font-bold" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email Address</label>
                    <input 
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      type="email" 
                      placeholder="john@agency.com" 
                      className="ui-input-tight" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phone Number</label>
                    <input 
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      type="tel" 
                      placeholder="0400 000 000" 
                      className="ui-input-tight" 
                    />
                  </div>
                </div>

                {(["TENANT_ADMIN", "ADMIN", "CLIENT"].includes(String(currentUserRole || ""))) && (
                  <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-6">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-900">Portal Password</h4>
                      <p className="text-xs text-slate-400">
                        Set a new password for this agent email (global per email). They can change it later in Settings.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!selectedAgent?.id) return alert("Save this contact first, then enable portal access.");
                          const res = await enableAgentPortalAccess({ agentId: String(selectedAgent.id) });
                          if (!res.success) return alert(res.error || "Failed to enable portal access.");
                          alert("Portal access enabled for this agent email.");
                        }}
                        className="h-11 px-5 rounded-2xl bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:text-slate-900 hover:border-slate-300 transition-all shadow-sm active:scale-95"
                      >
                        Enable Access
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!selectedAgent?.id) return alert("Save this contact first, then set a password.");
                          const pw = window.prompt("Set a new temporary password (min 8 chars):", "");
                          if (pw === null) return;
                          if (pw.trim().length < 8) return alert("Password must be at least 8 characters.");
                          const res = await setAgentPortalPassword({ agentId: String(selectedAgent.id), newPassword: pw.trim() });
                          if (!res.success) return alert(res.error || "Failed to set password.");
                          alert("Password saved.");
                        }}
                        className="h-11 px-5 rounded-2xl bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:text-primary hover:border-primary/30 transition-all shadow-sm active:scale-95"
                      >
                        Set Password
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
                  <select 
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                    className="ui-input-tight appearance-none bg-white"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>

                <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-900">See All Agency Data</h4>
                    <p className="text-xs text-slate-400">If OFF, contact only sees their own jobs.</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      settings: { ...formData.settings, seeAll: !formData.settings.seeAll }
                    })}
                    className={cn(
                      "w-12 h-6 rounded-full transition-colors relative",
                      formData.settings.seeAll ? "bg-primary" : "bg-slate-300"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform",
                      formData.settings.seeAll ? "translate-x-6" : "translate-x-0"
                    )} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4">
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 h-12 rounded-2xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : selectedAgent ? "Update Contact" : "Add Contact"}
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setSelectedAgent(null);
                    setShowForm(false);
                  }}
                  className="h-12 px-6 rounded-2xl bg-slate-50 text-slate-500 font-bold hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Contacts ({agents.length})</h3>
                <button 
                  onClick={() => setShowForm(true)}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  + Add New Contact
                </button>
              </div>

              <div className="space-y-3">
                {agents.map((agent) => (
                  <div 
                    key={agent.id}
                    className="group p-4 rounded-[24px] border border-slate-100 bg-slate-50/30 flex items-center justify-between hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 hover:border-white transition-all duration-300"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center overflow-hidden shadow-inner">
                        {agent.avatarUrl ? (
                          <img src={agent.avatarUrl} className="h-full w-full object-cover" alt={agent.name} />
                        ) : (
                          <User className="h-5 w-5 text-slate-300" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <h4 className="font-bold text-slate-900 leading-tight">{agent.name}</h4>
                        <div className="flex items-center gap-3">
                          {agent.phone && (
                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                              <Phone className="h-2.5 w-2.5" /> {agent.phone}
                            </span>
                          )}
                          {agent.email && (
                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                              <Mail className="h-2.5 w-2.5" /> {agent.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => {
                          setSelectedAgent(agent);
                          setShowForm(true);
                        }}
                        className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-colors"
                      >
                        <Edit3Icon className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(agent.id)}
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {agents.length === 0 && (
                  <div className="py-12 text-center bg-slate-50/50 rounded-[32px] border-2 border-dashed border-slate-100">
                    <User className="h-8 w-8 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-400">No contacts added yet.</p>
                    <button 
                      onClick={() => setShowForm(true)}
                      className="mt-4 px-6 py-2 bg-white rounded-full text-xs font-bold text-slate-600 shadow-sm border border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      Add first contact
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Edit3Icon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
  );
}

