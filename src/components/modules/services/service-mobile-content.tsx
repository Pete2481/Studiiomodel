"use client";

import React, { useState } from "react";
import { 
  Plus, 
  Search, 
  Star, 
  Clock, 
  MoreVertical, 
  Camera, 
  Zap, 
  Video, 
  FileText, 
  Wrench,
  Sun, 
  Box, 
  Edit3, 
  User,
  Plane,
  Moon,
  Trash2,
  Edit2,
  DollarSign,
  ChevronRight,
  MoreHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceDrawer } from "./service-drawer";
import { upsertService, deleteService, toggleServiceFavorite } from "@/app/actions/service";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";

interface ServiceMobileContentProps {
  initialServices: any[];
}

const IconMap: Record<string, any> = {
  CAMERA: Camera,
  DRONE: Plane,
  VIDEO: Video,
  FILETEXT: FileText,
  SERVICE: Wrench,
  SUNSET: Sun,
  PACKAGE: Box,
  "EDIT PEN": Edit3,
  PERSON: User
};

export function ServiceMobileContent({ initialServices }: ServiceMobileContentProps) {
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [services, setServices] = useState(initialServices);
  const [searchQuery, setSearchQuery] = useState("");
  const [isActionsOpen, setIsActionsOpen] = useState<string | null>(null);

  const handleEdit = (service: any) => {
    setSelectedService(service);
    setIsDrawerOpen(true);
    setIsActionsOpen(null);
  };

  const handleCreate = () => {
    setSelectedService(null);
    setIsDrawerOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this service?")) {
      const result = await deleteService(id);
      if (result.success) {
        setServices(prev => prev.filter(s => s.id !== id));
      } else {
        alert(result.error);
      }
    }
    setIsActionsOpen(null);
  };

  const handleToggleFavorite = async (id: string, current: boolean) => {
    const result = await toggleServiceFavorite(id, !current);
    if (result.success) {
      setServices(prev => prev.map(s => 
        s.id === id ? { ...s, isFavorite: !current } : s
      ));
    } else {
      alert(result.error);
    }
  };

  const handleSave = async (data: any) => {
    const result = await upsertService(data);
    if (result.success) {
      setIsDrawerOpen(false);
      router.refresh();
    } else {
      alert(result.error);
    }
  };

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 px-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <input 
          type="text" 
          placeholder="Search service catalogue..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-14 bg-slate-50 border-none rounded-2xl pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-primary/20 transition-all shadow-sm" 
        />
      </div>

      {/* Service Cards */}
      <div className="space-y-4">
        {filteredServices.length > 0 ? (
          filteredServices.map((service) => {
            const Icon = IconMap[service.iconName] || Camera;
            return (
              <div 
                key={service.id}
                className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500"
              >
                <div className="p-6">
                  {/* Card Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center shrink-0 shadow-inner ring-1 ring-slate-100">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-black text-slate-900 truncate leading-tight">
                            {service.name}
                          </h4>
                          {service.isFavorite && <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {service.durationMinutes}m duration
                          </span>
                          {service.slotType && (
                            <span className={cn(
                              "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest",
                              service.slotType === 'SUNRISE' ? "bg-amber-50 text-amber-600" : "bg-indigo-50 text-indigo-600"
                            )}>
                              {service.slotType}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="relative">
                      <button 
                        onClick={() => setIsActionsOpen(isActionsOpen === service.id ? null : service.id)}
                        className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 active:scale-90 transition-all"
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                      
                      {isActionsOpen === service.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setIsActionsOpen(null)} />
                          <div className="absolute right-0 top-12 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-20 animate-in fade-in zoom-in duration-200">
                            <button 
                              onClick={() => handleEdit(service)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-slate-600 active:bg-slate-50"
                            >
                              <Edit2 className="h-4 w-4" /> Edit Service
                            </button>
                            <button 
                              onClick={() => handleToggleFavorite(service.id, service.isFavorite)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-slate-600 active:bg-slate-50"
                            >
                              <Star className={cn("h-4 w-4", service.isFavorite && "fill-amber-400 text-amber-400")} /> 
                              {service.isFavorite ? "Unfavorite" : "Set Favorite"}
                            </button>
                            <div className="h-px bg-slate-50 mx-2 my-1" />
                            <button 
                              onClick={() => handleDelete(service.id)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-rose-500 active:bg-rose-50"
                            >
                              <Trash2 className="h-4 w-4" /> Delete Service
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs font-medium text-slate-500 mb-6 leading-relaxed">
                    {service.description}
                  </p>

                  {/* Price & Usage */}
                  <div className="flex items-center justify-between gap-6 p-4 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                    <div>
                      <div className="flex items-center gap-2 text-primary mb-1">
                        <DollarSign className="h-3 w-3" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Base Rate</span>
                      </div>
                      <p className="text-xl font-black text-slate-900">${Number(service.price).toFixed(2)}</p>
                    </div>
                    
                    <div className="flex-1 max-w-[120px]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Popularity</span>
                        <span className="text-[9px] font-black text-slate-900">{service.usage}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full" 
                          style={{ width: `${service.usage}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Edit Button */}
                  <button 
                    onClick={() => handleEdit(service)}
                    className="w-full mt-4 h-14 rounded-2xl bg-white border border-slate-200 text-slate-600 flex items-center justify-center gap-3 font-bold text-sm active:scale-[0.98] transition-all shadow-sm"
                  >
                    <Edit3 className="h-4 w-4" />
                    Configure Package
                  </button>
                </div>

                {/* Status Footer */}
                <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "h-2 w-2 rounded-full",
                      service.active ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                    )} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                      {service.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {service.clientVisible && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-500">
                      <Zap className="h-3 w-3" />
                      CLIENT VISIBLE
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState 
            icon={Wrench}
            title={searchQuery ? "No matching services" : "No services yet"}
            description={searchQuery 
              ? "Try adjusting your search terms or filters." 
              : "Create your first production package to start booking shoots."}
            action={!searchQuery ? {
              label: "New Service",
              onClick: handleCreate,
              icon: Plus
            } : undefined}
          />
        )}
      </div>

      {/* Service Drawer */}
      <ServiceDrawer 
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        service={selectedService}
        onSave={handleSave}
      />
    </div>
  );
}

