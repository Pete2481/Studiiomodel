"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Plus, 
  Search, 
  Star, 
  Clock, 
  MoreVertical, 
  Upload, 
  Copy,
  Sun, 
  Moon,
  Trash2,
  Edit2,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getServiceIconComponent, getServiceIconStyle, normalizeServiceIconKey } from "@/lib/service-icons";
import { ServiceDrawer } from "./service-drawer";
import { upsertService, deleteService, importServicesCsv, toggleServiceFavorite, duplicateService, getClientServiceFavorites, toggleClientServiceFavorite } from "@/app/actions/service";
import { useSearchParams, usePathname } from "next/navigation";

interface ServicePageContentProps {
  initialServices: any[];
  isActionLocked?: boolean;
}

export function ServicePageContent({ 
  initialServices,
  isActionLocked = false 
}: ServicePageContentProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [services, setServices] = useState(initialServices);
  const [searchQuery, setSearchQuery] = useState("");
  const [isActionsOpen, setIsActionsOpen] = useState<string | null>(null);
  const [togglingFavId, setTogglingFavId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const action = searchParams.get("action");
    if (action === "new") {
      setSelectedService(null);
      setIsDrawerOpen(true);
      
      // Silent cleanup
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("action");
      const cleanUrl = pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [searchParams, pathname]);

  const handleEdit = (service: any) => {
    setSelectedService(service);
    setIsDrawerOpen(true);
    setIsActionsOpen(null);
  };

  const handleCreate = () => {
    if (isActionLocked) {
      window.location.href = "/tenant/settings?tab=billing";
      return;
    }
    setSelectedService(null);
    setIsDrawerOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this service?")) {
      const result = await deleteService(id);
      if (result.success) {
        window.location.reload();
      } else {
        alert(result.error);
      }
    }
    setIsActionsOpen(null);
  };

  const handleDuplicate = async (service: any) => {
    if (isActionLocked) {
      window.location.href = "/tenant/settings?tab=billing";
      return;
    }
    const result = await duplicateService(service.id);
    if (result.success) {
      window.location.reload();
    } else {
      alert(result.error || "Failed to duplicate service");
    }
    setIsActionsOpen(null);
  };

  const handleToggleFavorite = async (id: string, current: boolean) => {
    setTogglingFavId(id);
    try {
      const result = await toggleServiceFavorite(id, !current);
      if (result.success) {
        window.location.reload();
      } else {
        alert(result.error);
      }
    } catch (err) {
      console.error("Toggle Fav Error:", err);
    } finally {
      setTogglingFavId(null);
    }
  };

  const handleSave = async (data: any) => {
    try {
      const result = await upsertService(data);
      if (result && result.success) {
        window.location.reload();
      } else {
        alert(result?.error || "Failed to save service");
      }
    } catch (err) {
      console.error("SAVE ERROR:", err);
      alert("An unexpected error occurred while saving.");
    }
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const result = await importServicesCsv(formData);
    if (result.success) {
      alert(`Successfully imported ${result.count} services!`);
      window.location.reload();
    } else {
      alert(result.error);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search services..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ui-input w-80 pl-11 pr-20" 
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-rose-50 rounded-lg">
              <span className="text-[10px] font-bold text-rose-500 uppercase">Catalogue</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
              "ui-button-primary flex items-center gap-2 px-6",
              isActionLocked && "opacity-50 grayscale hover:grayscale-0 transition-all"
            )}
          >
            <Plus className="h-4 w-4" />
            {isActionLocked ? "Sub Required" : "New Service"}
          </button>
        </div>
      </div>

      {/* List Header */}
      <div className="hidden lg:grid lg:grid-cols-[2fr_2fr_1fr_1fr_1.5fr_0.5fr] gap-4 px-8 py-4 bg-slate-50/50 rounded-2xl border border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        <span>Service Package</span>
        <span>Description</span>
        <span>Cost / Duration</span>
        <span className="text-center">Usage</span>
        <span className="text-center">Status / Fav</span>
        <span className="text-right">Actions</span>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filteredServices.map((service) => {
          const iconKey = normalizeServiceIconKey(service.icon);
          const Icon = getServiceIconComponent(iconKey);
          const iconStyle = getServiceIconStyle(iconKey);
          return (
            <div 
              key={service.id} 
              className="group grid grid-cols-1 lg:grid-cols-[2fr_2fr_1fr_1fr_1.5fr_0.5fr] gap-4 items-center px-8 py-5 bg-white rounded-[32px] border border-slate-100 hover:border-emerald-200 hover:shadow-xl hover:shadow-slate-100 transition-all cursor-pointer relative"
              onClick={() => handleEdit(service)}
            >
              {/* Name & Icon */}
              <div className="flex items-center gap-4">
                <div className={cn(
                  "h-12 w-12 rounded-2xl flex items-center justify-center transition-colors shrink-0 shadow-inner ring-1",
                  iconStyle.bg,
                  iconStyle.text,
                  iconStyle.ring
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-slate-900 truncate group-hover:text-emerald-600 transition-colors">{service.name}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Base Package</p>
                    {service.slotType && (
                      <span className={cn(
                        "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest",
                        service.slotType === 'SUNRISE' ? "bg-amber-50 text-amber-600" : "bg-indigo-50 text-indigo-600"
                      )}>
                        {service.slotType === 'SUNRISE' ? <Sun className="h-2 w-2" /> : <Moon className="h-2 w-2" />}
                        {service.slotType}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs font-medium text-slate-500 line-clamp-2 pr-4">{service.description}</p>

              {/* Pricing & Duration */}
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-900">${Number(service.price).toFixed(2)}</p>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                  <Clock className="h-3 w-3" /> {service.durationMinutes}m
                </div>
              </div>

              {/* Usage */}
              <div className="flex flex-col gap-1.5 px-4">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                  <span>{service.usage || 0}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full" 
                    style={{ width: `${service.usage || 0}%` }}
                  />
                </div>
              </div>

              {/* Status & Fav */}
              <div className="flex items-center justify-center gap-4">
                <span className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold border uppercase tracking-wider",
                  service.status === 'ACTIVE' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-50 text-slate-400 border-slate-100"
                )}>
                  {service.status}
                </span>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    handleToggleFavorite(service.id, service.isFavorite);
                  }}
                  disabled={togglingFavId === service.id}
                  className={cn(
                    "h-8 w-8 flex items-center justify-center rounded-full transition-colors",
                    service.isFavorite ? "text-amber-400" : "text-slate-200 hover:text-slate-400"
                  )}
                >
                  {togglingFavId === service.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Star className={cn("h-5 w-5", service.isFavorite && "fill-current")} />
                  )}
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 relative">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsActionsOpen(isActionsOpen === service.id ? null : service.id);
                  }}
                  className="h-9 w-9 flex items-center justify-center rounded-full border border-slate-100 hover:bg-slate-50 text-slate-400 hover:text-slate-900 transition-all"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {isActionsOpen === service.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setIsActionsOpen(null); }} />
                    <div className="absolute right-0 top-10 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-20 animate-in fade-in zoom-in duration-150">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleEdit(service); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit Service
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDuplicate(service); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      >
                        <Copy className="h-3.5 w-3.5" /> Duplicate
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(service.id); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {filteredServices.length === 0 && (
          <div className="py-20 text-center text-slate-400 text-sm font-medium">
            No services found. Click 'New Service' to get started.
          </div>
        )}
      </div>

      <ServiceDrawer 
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        service={selectedService}
        onSave={handleSave}
      />
    </div>
  );
}

export function ClientServicePageContent({ initialServices }: { initialServices: any[] }) {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loadingFavs, setLoadingFavs] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingFavs(true);
      const res = await getClientServiceFavorites();
      if (!cancelled) {
        if (res.success) setFavoriteIds(new Set((res as any).favoriteServiceIds || []));
        setLoadingFavs(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = initialServices.filter((s) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return String(s.name || "").toLowerCase().includes(q) || String(s.description || "").toLowerCase().includes(q);
  });

  const onToggle = async (serviceId: string) => {
    const nextFav = !favoriteIds.has(serviceId);
    setTogglingId(serviceId);
    try {
      const res = await toggleClientServiceFavorite(serviceId, nextFav);
      if (res.success) {
        setFavoriteIds(new Set((res as any).favoriteServiceIds || []));
      } else {
        alert(res.error || "Failed to update favorite");
      }
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
          <input
            type="text"
            placeholder="Search services..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ui-input w-80 pl-11"
          />
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((service) => {
          const iconKey = normalizeServiceIconKey(service.icon);
          const Icon = getServiceIconComponent(iconKey);
          const iconStyle = getServiceIconStyle(iconKey);
          const isFav = favoriteIds.has(String(service.id));
          return (
            <div
              key={service.id}
              className="grid grid-cols-1 lg:grid-cols-[2fr_2fr_1fr_0.5fr] gap-4 items-center px-8 py-5 bg-white rounded-[32px] border border-slate-100 hover:border-emerald-200 hover:shadow-xl hover:shadow-slate-100 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center shadow-inner ring-1", iconStyle.bg, iconStyle.text, iconStyle.ring)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-slate-900 truncate">{service.name}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Catalogue</p>
                </div>
              </div>

              <p className="text-xs font-medium text-slate-500 line-clamp-2 pr-4">{service.description}</p>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                  <Clock className="h-3 w-3" /> {service.durationMinutes}m
                </div>
              </div>

              <div className="flex items-center justify-end">
                <button
                  onClick={() => onToggle(String(service.id))}
                  disabled={loadingFavs || togglingId === String(service.id)}
                  className={cn(
                    "h-10 w-10 flex items-center justify-center rounded-full border transition-colors",
                    isFav ? "border-amber-200 bg-amber-50 text-amber-500" : "border-slate-100 bg-white text-slate-300 hover:text-slate-500"
                  )}
                  title={isFav ? "Remove from favorites" : "Add to favorites"}
                >
                  {togglingId === String(service.id) ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Star className={cn("h-5 w-5", isFav && "fill-current")} />
                  )}
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="py-20 text-center text-slate-400 text-sm font-medium">
            No services found.
          </div>
        )}
      </div>
    </div>
  );
}

