"use client";

import React, { useState, useEffect } from "react";
import { Plus, Search, Filter, Image as ImageIcon, Video, MoreHorizontal, ExternalLink, Settings, Trash2, ArrowRight, Heart, Lock, ShieldCheck, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GalleryDrawer } from "../modules/galleries/gallery-drawer";
import { GalleryStatusDropdown } from "../modules/galleries/gallery-status-dropdown";
import { deleteGallery, notifyGalleryClient, updateGalleryStatus } from "@/app/actions/gallery";
import Link from "next/link";
import { Hint } from "@/components/ui";
import { Bell } from "lucide-react";

interface DashboardGalleriesProps {
  initialGalleries: any[];
  clients: any[];
  bookings: any[];
  agents: any[];
  services: any[];
  user: any;
  isActionLocked?: boolean;
}

import { AutoFadeCover } from "../ui/auto-fade-cover";

export function DashboardGalleries({ 
  initialGalleries, 
  clients, 
  bookings, 
  agents,
  services,
  user,
  isActionLocked = false
}: DashboardGalleriesProps) {
  const [galleries, setGalleries] = useState(initialGalleries);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedGallery, setSelectedGallery] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleCreate = () => {
    setSelectedGallery(null);
    setIsDrawerOpen(true);
  };

  const handleEdit = (gallery: any) => {
    setSelectedGallery(gallery);
    setIsDrawerOpen(true);
  };

  const handleNotify = async (galleryId: string) => {
    const result = await notifyGalleryClient(galleryId);
    if (result.success) {
      alert("Client notification sent successfully!");
    } else {
      alert(result.error || "Failed to send notification");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this gallery?")) {
      const res = await deleteGallery(id);
      if (res.success) {
        setGalleries(galleries.filter(g => g.id !== id));
      }
    }
  };

  const filteredGalleries = galleries.filter(g => 
    g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.property.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 8); // Always show max 8 on dashboard

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Featured galleries</h2>
          <p className="text-sm font-medium text-slate-500">Latest image collections ready for client delivery.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            href="/tenant/galleries"
            className="h-10 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 rounded-full px-5 text-xs font-bold transition-all active:scale-95 flex items-center gap-2"
          >
            See All
            <ArrowRight className="h-3 w-3" />
          </Link>
          {user.role !== "CLIENT" && (
            <Hint 
              title="New Production" 
              content="Create a new gallery to begin uploading and delivering media to your clients."
            >
              <button 
                onClick={() => {
                  if (isActionLocked) {
                    window.location.href = "/tenant/settings?tab=billing";
                    return;
                  }
                  handleCreate();
                }}
                className={cn(
                  "h-10 bg-[var(--primary)] hover:opacity-90 text-white rounded-full px-5 text-xs font-bold transition-all shadow-lg shadow-primary/20 active:scale-95 flex items-center gap-2",
                  isActionLocked && "opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all"
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                {isActionLocked ? "Subscription Required" : "Add gallery"}
              </button>
            </Hint>
          )}
        </div>
      </header>

      {/* Filter Bar */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search galleries..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ui-input w-64 pl-11" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredGalleries.map((gallery: any, idx: number) => (
          <div key={gallery.id} className="group relative flex flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white transition-all hover:shadow-xl hover:shadow-slate-200/50">
            {/* Cover Image */}
            <div className="aspect-[4/3] overflow-hidden relative bg-slate-100">
              {idx === 0 ? (
                <AutoFadeCover 
                  images={gallery.allMedia || [gallery.cover]} 
                  title={gallery.title} 
                  fallback={gallery.cover} 
                />
              ) : (
                <img 
                  src={gallery.cover} 
                  alt={gallery.title} 
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              )}
              <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div className="flex gap-2">
                  <Link 
                    href={`/gallery/${gallery.id}`} 
                    target="_blank"
                    className="h-10 w-10 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                  {user.role !== "CLIENT" && (
                    <button 
                      onClick={() => handleEdit(gallery)}
                      className="h-10 w-10 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="absolute top-4 right-4">
                <GalleryStatusDropdown 
                  galleryId={gallery.id} 
                  currentStatus={gallery.status} 
                  user={user}
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col p-6">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 group-hover:text-primary transition-colors line-clamp-1">{gallery.title}</h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight mt-0.5 truncate">
                    By {gallery.photographers || "Unknown"}
                  </p>
                </div>
                {user.role !== "CLIENT" && (
                  <div className="relative group/menu">
                    <button className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 hidden group-hover/menu:block z-10">
                      <div className="bg-white rounded-xl shadow-xl border border-slate-100 py-1 min-w-[140px]">
                        <button 
                          onClick={() => handleNotify(gallery.id)}
                          className="w-full px-4 py-2 text-left text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 border-b border-slate-50 pb-2"
                        >
                          <Bell className="h-3 w-3" />
                          Notify Again
                        </button>
                        <button 
                          onClick={() => handleDelete(gallery.id)}
                          className="w-full px-4 py-2 text-left text-xs font-bold text-rose-500 hover:bg-rose-50 flex items-center gap-2 pt-2"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

                          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1 text-slate-400">
                                <ImageIcon className="h-3 w-3" />
                                <span className="text-[10px] font-bold">{gallery.mediaCount || 0}</span>
                              </div>
                              <div className="flex items-center gap-1 text-slate-400">
                                <Video className="h-3 w-3" />
                                <span className="text-[10px] font-bold">{gallery.videoCount || 0}</span>
                              </div>
                              {gallery.favoriteCount > 0 && (
                                <div className="flex items-center gap-1 text-rose-500 animate-in zoom-in duration-300">
                                  <Heart className="h-3 w-3 fill-current" />
                                </div>
                              )}
                              {gallery.isLocked && (
                                <div className="flex items-center gap-1 text-slate-400" title="Gallery Locked">
                                  <Lock className="h-3 w-3" />
                                </div>
                              )}
                              {gallery.watermarkEnabled && (
                                <div className="flex items-center gap-1 text-primary" title="Watermark Enabled">
                                  <ShieldCheck className="h-3 w-3" />
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{gallery.client}</span>
                          </div>
            </div>
          </div>
        ))}
        {filteredGalleries.length === 0 && (
          <div className="col-span-full py-20 text-center rounded-[32px] border-2 border-dashed border-slate-100 bg-white shadow-sm">
            <ImageIcon className="h-10 w-10 text-slate-200 mx-auto mb-4" />
            <p className="text-sm font-bold text-slate-400 tracking-tight">No galleries found matching your search.</p>
          </div>
        )}
      </div>

      <GalleryDrawer 
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        clients={clients}
        bookings={bookings}
        agents={agents}
        services={services}
        initialGallery={selectedGallery}
        onRefresh={() => window.location.reload()}
      />
    </section>
  );
}

