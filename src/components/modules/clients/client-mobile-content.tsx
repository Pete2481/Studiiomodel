"use client";

import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Search, 
  Mail, 
  Phone, 
  MoreVertical, 
  UserPlus, 
  ShieldCheck,
  ExternalLink,
  Trash2,
  Edit2,
  Users,
  Send,
  MoreHorizontal,
  ChevronRight,
  MessageSquare,
  Globe,
  Star,
  Calendar,
  ImageIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientDrawer } from "./client-drawer";
import { AgentDrawer } from "./agent-drawer";
import { upsertClient, deleteClient, resendClientInvite } from "@/app/actions/client";
import { getAgentsByClient } from "@/app/actions/agent";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";

interface ClientMobileContentProps {
  initialClients: any[];
  services: any[];
}

export function ClientMobileContent({ initialClients, services }: ClientMobileContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [clients, setClients] = useState(initialClients);
  const [searchQuery, setSearchQuery] = useState("");
  const [isActionsOpen, setIsActionsOpen] = useState<string | null>(null);

  // Agent Management
  const [isAgentDrawerOpen, setIsAgentDrawerOpen] = useState(false);
  const [activeAgency, setActiveAgency] = useState<{ id: string, name: string } | null>(null);
  const [agencyAgents, setAgencyAgents] = useState<any[]>([]);

  const handleOpenAgents = async (client: any) => {
    setActiveAgency({ id: client.id, name: client.businessName || client.name });
    setIsAgentDrawerOpen(true);
    const agents = await getAgentsByClient(client.id);
    setAgencyAgents(agents);
  };

  const refreshAgents = async () => {
    if (activeAgency) {
      const agents = await getAgentsByClient(activeAgency.id);
      setAgencyAgents(agents);
    }
  };

  const handleEdit = (client: any) => {
    setSelectedClient(client);
    setIsDrawerOpen(true);
    setIsActionsOpen(null);
  };

  const handleCreate = () => {
    setSelectedClient(null);
    setIsDrawerOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to archive this client?")) {
      const result = await deleteClient(id);
      if (result.success) {
        setClients(prev => prev.filter(c => c.id !== id));
      } else {
        alert(result.error);
      }
    }
    setIsActionsOpen(null);
  };

  const handleResendInvite = async (id: string) => {
    const result = await resendClientInvite(id);
    if (result.success) {
      alert("Invitation email resent successfully!");
    } else {
      alert(result.error);
    }
    setIsActionsOpen(null);
  };

  const handleSave = async (data: any) => {
    const result = await upsertClient(data);
    if (result.success) {
      setIsDrawerOpen(false);
      router.refresh();
    } else {
      alert(result.error);
    }
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.businessName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 px-6">
      {/* Search Bar - Integrated style */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <input 
          type="text" 
          placeholder="Search client directory..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-14 bg-slate-50 border-none rounded-2xl pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-primary/20 transition-all shadow-sm" 
        />
      </div>

      {/* Client Cards */}
      <div className="space-y-4">
        {filteredClients.length > 0 ? (
          filteredClients.map((client) => (
            <div 
              key={client.id}
              className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500"
            >
              <div className="p-6">
                {/* Card Header */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl overflow-hidden bg-slate-50 shrink-0 shadow-inner ring-1 ring-slate-100 flex items-center justify-center">
                      {client.avatar ? (
                        <img src={client.avatar} alt={client.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xl font-black text-slate-200">{client.name[0]}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-base font-black text-slate-900 truncate leading-tight">
                        {client.businessName || client.name}
                      </h4>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {client.name}
                      </p>
                    </div>
                  </div>
                  
                  <div className="relative">
                    <button 
                      onClick={() => setIsActionsOpen(isActionsOpen === client.id ? null : client.id)}
                      className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 active:scale-90 transition-all"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                    
                    {isActionsOpen === client.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsActionsOpen(null)} />
                        <div className="absolute right-0 top-12 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-20 animate-in fade-in zoom-in duration-200">
                          <button 
                            onClick={() => handleEdit(client)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-slate-600 active:bg-slate-50"
                          >
                            <Edit2 className="h-4 w-4" /> Edit Profile
                          </button>
                          <button 
                            onClick={() => handleResendInvite(client.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-slate-600 active:bg-slate-50"
                          >
                            <Send className="h-4 w-4" /> Resend Welcome
                          </button>
                          <button 
                            onClick={() => handleOpenAgents(client)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-slate-600 active:bg-slate-50"
                          >
                            <Users className="h-4 w-4" /> Manage Agents
                          </button>
                          <div className="h-px bg-slate-50 mx-2 my-1" />
                          <button 
                            onClick={() => handleDelete(client.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-rose-500 active:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" /> Archive Client
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
                      <span className="text-[10px] font-black uppercase tracking-widest">Bookings</span>
                    </div>
                    <p className="text-xl font-black text-slate-900">{client.bookings}</p>
                  </div>
                  <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50">
                    <div className="flex items-center gap-2 text-blue-500 mb-1">
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Galleries</span>
                    </div>
                    <p className="text-xl font-black text-slate-900">{client.galleries}</p>
                  </div>
                </div>

                {/* Quick Actions / Contact */}
                <div className="flex gap-2">
                  <a 
                    href={`tel:${client.phone}`}
                    className={cn(
                      "flex-1 h-14 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm transition-all active:scale-95 shadow-sm",
                      client.phone ? "bg-primary text-white shadow-primary/10" : "bg-slate-50 text-slate-300 pointer-events-none"
                    )}
                  >
                    <Phone className="h-4 w-4" />
                    Call
                  </a>
                  <a 
                    href={`mailto:${client.email}`}
                    className={cn(
                      "flex-1 h-14 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm transition-all active:scale-95 shadow-sm",
                      client.email ? "bg-slate-900 text-white shadow-slate-900/10" : "bg-slate-50 text-slate-300 pointer-events-none"
                    )}
                  >
                    <Mail className="h-4 w-4" />
                    Email
                  </a>
                  <button 
                    onClick={() => handleEdit(client)}
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
                    client.status === 'ACTIVE' ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                  )} />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                    {client.status}
                  </span>
                </div>
                {client.status === 'ACTIVE' && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary">
                    <ShieldCheck className="h-3 w-3" />
                    PORTAL ACTIVE
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <EmptyState 
            icon={Users}
            title={searchQuery ? "No matching clients" : "Your directory is empty"}
            description={searchQuery 
              ? "We couldn't find anyone matching that name or email. Try a different search." 
              : "Start building your production network by adding your first agency or client contact."}
            action={!searchQuery ? {
              label: "Add New Client",
              onClick: handleCreate,
              icon: Plus
            } : undefined}
          />
        )}
      </div>

      {/* Drawers */}
      <ClientDrawer 
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        client={selectedClient}
        services={services}
        onSave={handleSave}
      />

      <AgentDrawer 
        isOpen={isAgentDrawerOpen}
        onClose={() => setIsAgentDrawerOpen(false)}
        clientId={activeAgency?.id || ""}
        agencyName={activeAgency?.name || ""}
        agents={agencyAgents}
        onRefresh={refreshAgents}
      />
    </div>
  );
}

