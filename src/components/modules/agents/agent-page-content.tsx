"use client";

import React, { useState } from "react";
import { 
  Plus, 
  Search, 
  Mail, 
  Phone, 
  Trash2, 
  Edit2,
  User,
  ShieldCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentDrawer } from "@/components/modules/clients/agent-drawer";
import { getAgentsByClient, deleteAgent } from "@/app/actions/agent";

interface AgentPageContentProps {
  initialAgents: any[];
  role: string;
  clientId: string;
  clientInfo: any;
}

export function AgentPageContent({ initialAgents, role, clientId, clientInfo }: AgentPageContentProps) {
  const [agents, setAgents] = useState(initialAgents);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  
  // Agent Management Drawer State
  const [isAgentDrawerOpen, setIsAgentDrawerOpen] = useState(false);
  
  const refreshAgents = async () => {
    const updatedAgents = await getAgentsByClient(clientId);
    const serialized = updatedAgents.map((a: any) => ({
      ...a,
      createdAt: (a.createdAt as any).toISOString ? (a.createdAt as any).toISOString() : a.createdAt,
      updatedAt: (a.updatedAt as any).toISOString ? (a.updatedAt as any).toISOString() : a.updatedAt,
      agencyName: clientInfo?.businessName || "Your Agency"
    }));
    setAgents(serialized);
  };

  const handleCreate = () => {
    setSelectedAgent(null);
    setIsAgentDrawerOpen(true);
  };

  const handleEdit = (agent: any) => {
    setSelectedAgent(agent);
    setIsAgentDrawerOpen(true);
  };

  const filteredAgents = agents.filter(a => 
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.phone?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search agents..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ui-input w-80 pl-11" 
            />
          </div>
          <div className="px-4 py-2 bg-white border border-slate-200 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest shadow-sm">
            Total {agents.length}
          </div>
        </div>

        <button 
          onClick={handleCreate}
          className="ui-button-primary flex items-center gap-2 px-6"
        >
          <Plus className="h-4 w-4" />
          Add Agent
        </button>
      </div>

      {/* Agents Grid/List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAgents.map((agent) => (
          <div 
            key={agent.id}
            className="group bg-white rounded-[32px] border border-slate-100 p-6 hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 relative overflow-hidden"
          >
            {/* Top Pattern/Background */}
            <div className="absolute top-0 left-0 right-0 h-20 bg-slate-50 border-b border-slate-100 -z-0" />
            
            <div className="relative z-10 space-y-4">
              <div className="flex items-start justify-between">
                <div className="h-20 w-20 rounded-3xl bg-white border-4 border-white shadow-lg overflow-hidden flex items-center justify-center">
                  {agent.avatarUrl ? (
                    <img src={agent.avatarUrl} className="h-full w-full object-cover" alt={agent.name} />
                  ) : (
                    <User className="h-8 w-8 text-slate-200" />
                  )}
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                  agent.status === 'ACTIVE' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-50 text-slate-400 border border-slate-100"
                )}>
                  {agent.status}
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900 leading-tight group-hover:text-primary transition-colors">
                  {agent.name}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {agent.agencyName}
                </p>
              </div>

              <div className="pt-2 space-y-2">
                <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
                  <div className="h-7 w-7 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                    <Mail className="h-3.5 w-3.5" />
                  </div>
                  {agent.email || "No email"}
                </div>
                <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
                  <div className="h-7 w-7 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                    <Phone className="h-3.5 w-3.5" />
                  </div>
                  {agent.phone || "No phone"}
                </div>
              </div>

              <div className="pt-4 flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-2xl bg-slate-50 border border-slate-100">
                  <ShieldCheck className={cn(
                    "h-3.5 w-3.5",
                    agent.settings?.seeAll ? "text-primary" : "text-slate-300"
                  )} />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                    {agent.settings?.seeAll ? "Full Agency Access" : "Own Jobs Only"}
                  </span>
                </div>
                <button 
                  onClick={() => handleEdit(agent)}
                  className="h-9 w-9 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-primary hover:border-primary transition-all shadow-sm"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredAgents.length === 0 && (
          <div className="col-span-full py-20 text-center bg-slate-50/50 rounded-[40px] border-2 border-dashed border-slate-100">
            <User className="h-12 w-12 text-slate-200 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900">No agents found</h3>
            <p className="text-sm text-slate-400 max-w-xs mx-auto mt-1">
              {searchQuery ? "Try searching for another name or email." : "Start adding agents to your agency team."}
            </p>
            {!searchQuery && (
              <button 
                onClick={handleCreate}
                className="mt-6 ui-button-primary px-8"
              >
                Add Your First Agent
              </button>
            )}
          </div>
        )}
      </div>

      <AgentDrawer 
        isOpen={isAgentDrawerOpen}
        onClose={() => {
          setIsAgentDrawerOpen(false);
          setSelectedAgent(null);
        }}
        clientId={clientId}
        agencyName={clientInfo?.businessName || "Your Agency"}
        agents={agents}
        onRefresh={refreshAgents}
        initialAgent={selectedAgent}
      />
    </div>
  );
}

