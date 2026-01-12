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
  Upload
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDropboxUrl } from "@/lib/utils";
import { ClientDrawer } from "./client-drawer";
import { AgentDrawer } from "./agent-drawer";
import { ImpersonateClientButton } from "./impersonate-client-button";
import { upsertClient, deleteClient, resendClientInvite, importClientsCsv } from "@/app/actions/client";
import { getAgentsByClient } from "@/app/actions/agent";
import { useSearchParams, usePathname } from "next/navigation";

interface ClientPageContentProps {
  initialClients: any[];
  services: any[];
  isActionLocked?: boolean;
}

type SortMode = "name" | "mostUsed" | "mostBookings" | "mostGalleries" | "newest";

export function ClientPageContent({ 
  initialClients, 
  services,
  isActionLocked = false
}: ClientPageContentProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [clients, setClients] = useState(initialClients);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [isActionsOpen, setIsActionsOpen] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isActionLocked) {
      window.location.href = "/tenant/settings?tab=billing";
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const result = await importClientsCsv(formData);
    if (result.success) {
      alert(`Successfully imported ${result.count} clients!`);
      window.location.reload();
    } else {
      alert(result.error);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadTemplate = () => {
    const headers = ["Agency Name", "Contact Name", "Email", "Phone"];
    const row = ["Ray White HQ", "John Doe", "john@agency.com", "0412 345 678"];
    const csvContent = [headers, row].map(e => e.join(",")).join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "studiio_client_import_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    const action = searchParams.get("action");
    if (action === "new") {
      setSelectedClient(null);
      setIsDrawerOpen(true);
      
      // Silent cleanup
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("action");
      const cleanUrl = pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [searchParams, pathname]);

  useEffect(() => {
    const clientId = searchParams.get("clientId");
    if (clientId) {
      const client = clients.find(c => c.id === clientId);
      if (client) {
        setSelectedClient(client);
        setIsDrawerOpen(true);
      }
      
      // Silent cleanup
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("clientId");
      const cleanUrl = pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [searchParams, pathname, clients]);

  // Agent Management
  const [isAgentDrawerOpen, setIsAgentDrawerOpen] = useState(false);
  const [activeAgency, setActiveAgency] = useState<{ id: string, name: string } | null>(null);
  const [agencyAgents, setAgencyAgents] = useState<any[]>([]);

  const handleOpenAgents = async (client: any) => {
    setActiveAgency({ id: client.id, name: client.businessName || client.name });
    setIsAgentDrawerOpen(true);
    // Fetch agents for this client
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
    if (isActionLocked) {
      window.location.href = "/tenant/settings?tab=billing";
      return;
    }
    setSelectedClient(null);
    setIsDrawerOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to archive this client?")) {
      const result = await deleteClient(id);
      if (result.success) {
        window.location.reload();
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
      window.location.reload();
    } else {
      alert(result.error);
    }
  };

  const filteredClients = clients.filter(c => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      String(c.name || "").toLowerCase().includes(q) ||
      String(c.businessName || "").toLowerCase().includes(q) ||
      String(c.email || "").toLowerCase().includes(q)
    );
  });

  const sortedClients = [...filteredClients].sort((a, b) => {
    const aBookings = Number(a.bookingCount ?? a.bookings ?? 0);
    const bBookings = Number(b.bookingCount ?? b.bookings ?? 0);
    const aGalleries = Number(a.galleryCount ?? a.galleries ?? 0);
    const bGalleries = Number(b.galleryCount ?? b.galleries ?? 0);

    if (sortMode === "mostBookings") return bBookings - aBookings;
    if (sortMode === "mostGalleries") return bGalleries - aGalleries;
    if (sortMode === "mostUsed") {
      const aScore = aBookings + aGalleries;
      const bScore = bBookings + bGalleries;
      if (bScore !== aScore) return bScore - aScore;
      if (bBookings !== aBookings) return bBookings - aBookings;
      if (bGalleries !== aGalleries) return bGalleries - aGalleries;
    }
    if (sortMode === "newest") {
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bCreated - aCreated;
    }

    const aName = String(a.businessName || a.name || "").toLowerCase();
    const bName = String(b.businessName || b.name || "").toLowerCase();
    return aName.localeCompare(bName);
  });

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search clients..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ui-input w-80 pl-11" 
            />
          </div>
          <div className="relative">
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="ui-input w-56 pr-10 text-[12px] font-bold"
              aria-label="Sort clients"
            >
              <option value="name">Sort: Name</option>
              <option value="mostUsed">Sort: Most used</option>
              <option value="mostBookings">Sort: Most bookings</option>
              <option value="mostGalleries">Sort: Most galleries</option>
              <option value="newest">Sort: Newest</option>
            </select>
          </div>
          <div className="px-4 py-2 bg-white border border-slate-200 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest shadow-sm">
            Total {clients.length}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={downloadTemplate}
            className="flex h-10 px-4 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-500 hover:border-emerald-200 transition-all shadow-sm gap-2"
          >
            <ExternalLink className="h-3 w-3" /> Template
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportCsv} 
            accept=".csv" 
            className="hidden" 
          />
          <button 
            onClick={() => {
              if (isActionLocked) {
                window.location.href = "/tenant/settings?tab=billing";
                return;
              }
              fileInputRef.current?.click();
            }}
            className={cn(
              "flex h-10 px-4 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors shadow-sm gap-2",
              isActionLocked && "opacity-50 grayscale hover:grayscale-0 transition-all"
            )}
          >
            <Upload className="h-3.5 w-3.5" /> {isActionLocked ? "Sub Required" : "Import CSV"}
          </button>
          <button 
            onClick={handleCreate}
            className={cn(
              "flex h-10 px-4 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors shadow-sm gap-2",
              isActionLocked && "opacity-50 grayscale hover:grayscale-0 transition-all"
            )}
          >
            <UserPlus className="h-3.5 w-3.5" /> {isActionLocked ? "Sub Required" : "Invite Client"}
          </button>
          <button 
            onClick={handleCreate}
            className={cn(
              "ui-button-primary flex items-center gap-2 px-6",
              isActionLocked && "opacity-50 grayscale hover:grayscale-0 transition-all"
            )}
          >
            <Plus className="h-4 w-4" />
            {isActionLocked ? "Sub Required" : "New Client"}
          </button>
        </div>
      </div>

      {/* Client Table Header */}
      <div className="hidden lg:grid lg:grid-cols-[2fr_1.5fr_1fr_1fr_1fr_0.5fr] gap-4 px-8 py-4 bg-slate-50/50 rounded-2xl border border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        <span>Client</span>
        <span>Contact Details</span>
        <span>Stats</span>
        <span>Portal Access</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>

      {/* Client List */}
      <div className="space-y-3">
        {sortedClients.map((client) => (
          <div 
            key={client.id} 
            className="group grid grid-cols-1 lg:grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1.5fr_0.5fr] gap-4 items-center px-8 py-5 bg-white rounded-[32px] border border-slate-100 hover:border-emerald-200 hover:shadow-xl hover:shadow-slate-100 transition-all cursor-pointer relative"
            onClick={() => handleEdit(client)}
          >
            {/* Profile */}
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl overflow-hidden bg-slate-100 shrink-0 shadow-inner flex items-center justify-center">
                {client.avatarUrl ? (
                  <img src={formatDropboxUrl(client.avatarUrl)} alt={client.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-bold text-slate-300">{client.name[0]}</span>
                )}
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-slate-900 truncate group-hover:text-emerald-600 transition-colors">{client.businessName || client.name}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">{client.contact || client.name}</p>
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <Mail className="h-3 w-3 text-slate-300" /> {client.email}
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <Phone className="h-3 w-3 text-slate-300" /> {client.phone}
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-slate-700 tabular-nums">{Number(client.bookingCount ?? client.bookings ?? 0)} Bookings</p>
              <p className="text-[10px] text-slate-400 font-medium tabular-nums">{Number(client.galleryCount ?? client.galleries ?? 0)} Galleries</p>
            </div>

            {/* Portal Access */}
            <div className="flex items-center gap-2">
              <ShieldCheck className={cn(
                "h-4 w-4",
                client.status === 'ACTIVE' ? "text-emerald-500" : "text-slate-200"
              )} />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                {client.status === 'ACTIVE' ? 'Enabled' : 'Pending'}
              </span>
            </div>

            {/* Status */}
            <div>
              <span className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold border uppercase tracking-wider",
                client.status === 'ACTIVE' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"
              )}>
                {client.status}
              </span>
            </div>

            {/* Contacts Management */}
            <div className="flex items-center justify-end gap-2">
              <ImpersonateClientButton clientId={client.id} />
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenAgents(client);
                }}
                className="h-10 px-6 rounded-full border-2 border-rose-200 text-rose-500 font-bold text-xs hover:bg-rose-50 transition-all active:scale-95 flex items-center gap-2"
              >
                Contacts
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 relative">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsActionsOpen(isActionsOpen === client.id ? null : client.id);
                }}
                className="h-9 w-9 flex items-center justify-center rounded-full border border-slate-100 hover:bg-slate-50 text-slate-400 hover:text-slate-900 transition-all"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {isActionsOpen === client.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setIsActionsOpen(null); }} />
                  <div className="absolute right-0 top-10 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-20 animate-in fade-in zoom-in duration-150">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleEdit(client); }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5" /> Edit Profile
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleResendInvite(client.id); }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    >
                      <Mail className="h-3.5 w-3.5" /> Resend Welcome
                    </button>
                    <button 
                      className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> View Portal
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(client.id); }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors border-t border-slate-50 mt-1 pt-2"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Archive Client
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {sortedClients.length === 0 && (
          <div className="py-20 text-center text-slate-400 text-sm font-medium">
            No clients found matching your search.
          </div>
        )}
      </div>

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

