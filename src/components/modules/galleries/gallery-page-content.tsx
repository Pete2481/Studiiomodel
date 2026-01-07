"use client";

import React, { useState, useEffect } from "react";
import NextImage from "next/image";
import { Bell, DollarSign, Plus, Search, Filter, Image as ImageIcon, Video, MoreHorizontal, ExternalLink, Settings, Trash2, Heart, List as ListIcon, LayoutGrid, Mail, Copy, CheckCircle2, Clock, Check, Loader2, Lock, ShieldCheck, ChevronDown } from "lucide-react";
import { cn, formatDropboxUrl } from "@/lib/utils";
import { GalleryDrawer } from "./gallery-drawer";
import { GalleryStatusDropdown } from "./gallery-status-dropdown";
import { deleteGallery, notifyGalleryClient, updateGalleryStatus } from "@/app/actions/gallery";
import { createInvoiceFromGallery } from "@/app/actions/invoice";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { format } from "date-fns";
import { EmptyState } from "@/components/ui/empty-state";
import { permissionService } from "@/lib/permission-service";
import { InvoicePreviewModal } from "../invoices/invoice-preview-modal";

interface GalleryPageContentProps {
  galleries: any[];
  clients: any[];
  bookings: any[];
  agents: any[];
  services: any[];
  user: any;
  pagination: {
    total: number;
    page: number;
    limit: number;
  };
  isActionLocked?: boolean;
}

export function GalleryPageContent({ 
  galleries: initialGalleries, 
  clients, 
  bookings, 
  agents,
  services,
  user,
  pagination,
  isActionLocked = false
}: GalleryPageContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [galleries, setGalleries] = useState(initialGalleries);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedGallery, setSelectedGallery] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [isCreatingInvoice, setIsCreatingInvoice] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Sync state with props when router.refresh() is called
  useEffect(() => {
    setGalleries(initialGalleries);
  }, [initialGalleries]);

  useEffect(() => {
    const action = searchParams.get("action");
    if (action === "new") {
      setSelectedGallery(null);
      setIsDrawerOpen(true);
      
      // Silent cleanup of the URL without triggering re-renders
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("action");
      const cleanUrl = pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [searchParams, pathname]);

  useEffect(() => {
    const galleryId = searchParams.get("galleryId");
    if (galleryId) {
      const gallery = galleries.find(g => g.id === galleryId);
      if (gallery) {
        setSelectedGallery(gallery);
        setIsDrawerOpen(true);
      }
      
      // Silent cleanup
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("galleryId");
      const cleanUrl = pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [searchParams, pathname, galleries]);

  const handleCreate = () => {
    if (!permissionService.can(user, "manageGalleries")) {
      alert("Permission Denied: You cannot create galleries.");
      return;
    }
    if (isActionLocked) {
      window.location.href = "/tenant/settings?tab=billing";
      return;
    }
    setSelectedGallery(null);
    setIsDrawerOpen(true);
  };

  const handleEdit = (gallery: any) => {
    if (!permissionService.can(user, "manageGalleries")) {
      alert("Permission Denied: You cannot edit galleries.");
      return;
    }
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
    if (!permissionService.can(user, "deleteGallery")) {
      alert("Permission Denied: You cannot delete galleries.");
      return;
    }
    if (confirm("Are you sure you want to delete this gallery?")) {
      const res = await deleteGallery(id);
      if (res.success) {
        setGalleries(galleries.filter(g => g.id !== id));
      }
    }
  };

  const handleCreateInvoice = async (galleryId: string) => {
    if (!permissionService.can(user, "viewInvoices")) {
      alert("Permission Denied: You cannot manage invoices.");
      return;
    }
    if (isCreatingInvoice) return;
    if (isActionLocked) {
      window.location.href = "/tenant/settings?tab=billing";
      return;
    }
    setIsCreatingInvoice(galleryId);
    try {
      const res = await createInvoiceFromGallery(galleryId);
      if (res.success && res.invoiceId) {
        // OPEN the editor as requested
        router.push(`/tenant/invoices/${res.invoiceId}/edit`);
      } else {
        alert(res.error || "Failed to create invoice");
      }
    } catch (err) {
      console.error("Invoice creation error:", err);
      alert("An unexpected error occurred. Please try again.");
    } finally {
      setIsCreatingInvoice(null);
    }
  };

  const filteredGalleries = galleries.filter(g => 
    g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.property.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Filter Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
          <button className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-900 transition-colors">
            <Filter className="h-4 w-4" />
          </button>

          {/* View Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-full border border-slate-200 ml-2">
            <button 
              onClick={() => setViewMode("grid")}
              className={cn(
                "h-9 w-10 flex items-center justify-center rounded-full transition-all",
                viewMode === "grid" ? "bg-white text-primary shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button 
              onClick={() => setViewMode("list")}
              className={cn(
                "h-9 w-10 flex items-center justify-center rounded-full transition-all",
                viewMode === "list" ? "bg-white text-primary shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {user.role !== "CLIENT" && (
          <button 
            onClick={handleCreate}
            className={cn(
              "ui-button-primary flex items-center gap-2",
              isActionLocked && "opacity-50 grayscale hover:grayscale-0 transition-all"
            )}
          >
            <Plus className="h-4 w-4" />
            {isActionLocked ? "Subscription Required" : "New Gallery"}
          </button>
        )}
      </div>

      {/* Gallery Content */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredGalleries.map((gallery: any) => (
            <div key={gallery.id} className="group relative flex flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white transition-all hover:shadow-xl hover:shadow-slate-200/50">
              {/* Cover Image */}
              <div className="aspect-[4/3] overflow-hidden relative">
                {gallery.cover && gallery.cover !== "" ? (
                  gallery.cover?.includes("/api/dropbox/assets") ? (
                    <img 
                      src={gallery.cover?.includes("dropbox.com") || gallery.cover?.includes("dropboxusercontent.com")
                        ? `/api/dropbox/assets/${gallery.id}?path=/cover.jpg&sharedLink=${encodeURIComponent(gallery.cover.replace("dl.dropboxusercontent.com", "www.dropbox.com"))}&size=w640h480` 
                        : formatDropboxUrl(gallery.cover)}
                      alt={gallery.title} 
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      loading={filteredGalleries.indexOf(gallery) < 4 ? "eager" : "lazy"}
                    />
                  ) : (
                    <NextImage 
                      src={formatDropboxUrl(gallery.cover)}
                      alt={gallery.title} 
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-110"
                      priority={filteredGalleries.indexOf(gallery) < 4}
                    />
                  )
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-slate-50 text-slate-200">
                    <ImageIcon className="h-8 w-8" />
                  </div>
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
        </div>
      ) : (
        <div className="ui-card overflow-hidden p-0 border-slate-100 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Job</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client & Agent</th>
                  {(user.role !== "CLIENT" || permissionService.can(user, "canViewInvoices")) && (
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice</th>
                  )}
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Team</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Media</th>
                  {user.role !== "CLIENT" && (
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredGalleries.map((gallery: any) => (
                  <tr key={gallery.id} className="group hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-4">
                                    <div className="h-12 w-16 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center relative">
                                      {gallery.cover && gallery.cover !== "" ? (
                                        gallery.cover?.includes("/api/dropbox/assets") ? (
                                          <img 
                                            src={gallery.cover?.includes("dropbox.com") || gallery.cover?.includes("dropboxusercontent.com")
                                              ? `/api/dropbox/assets/${gallery.id}?path=/cover.jpg&sharedLink=${encodeURIComponent(gallery.cover.replace("dl.dropboxusercontent.com", "www.dropbox.com"))}&size=w64h64` 
                                              : formatDropboxUrl(gallery.cover)}
                                            alt={gallery.title}
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <NextImage 
                                            src={formatDropboxUrl(gallery.cover)}
                                            alt={gallery.title}
                                            fill
                                            sizes="64px"
                                            className="object-cover"
                                          />
                                        )
                                      ) : (
                                        <ImageIcon className="h-4 w-4 text-slate-300" />
                                      )}
                                    </div>
                                    <div className="space-y-0.5">
                          <p className="text-sm font-bold text-slate-900 line-clamp-1">{gallery.property}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight line-clamp-1">{gallery.title}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-0.5">
                        <p className="text-sm font-bold text-slate-900">{gallery.client}</p>
                        {gallery.agentId && (
                          <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                            {agents.find(a => a.id === gallery.agentId)?.name || "Lead Agent"}
                          </p>
                        )}
                      </div>
                    </td>
                    {(user.role !== "CLIENT" || permissionService.can(user, "canViewInvoices")) && (
                      <td className="px-6 py-4">
                        {gallery.invoice ? (
                          (user.role !== "CLIENT" && gallery.invoice.status === 'DRAFT' && gallery.status !== 'DELIVERED') ? (
                            <Link 
                              href={`/tenant/invoices/${gallery.invoice.id}/edit`}
                              className="h-10 px-6 rounded-full bg-amber-400 text-amber-950 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-amber-500 transition-all shadow-[0_8px_20px_-4px_rgba(251,191,36,0.4)]"
                            >
                              <Clock className="h-3.5 w-3.5" />
                              Finalize Invoice
                            </Link>
                          ) : (
                            <button 
                              onClick={() => {
                                if (!permissionService.can(user, "canViewInvoices")) return;
                                setSelectedInvoice(gallery.invoice);
                                setIsPreviewOpen(true);
                              }}
                              className={cn(
                                "h-9 px-4 rounded-xl border border-primary/20 bg-primary/5 text-primary text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
                                permissionService.can(user, "canViewInvoices") ? "hover:bg-primary/10 cursor-pointer" : "opacity-50 grayscale cursor-not-allowed"
                              )}
                            >
                              <DollarSign className="h-3 w-3" />
                              View {gallery.invoice.number}
                            </button>
                          )
                        ) : (user.role !== "CLIENT" && !isActionLocked) ? (
                          <button 
                            onClick={() => handleCreateInvoice(gallery.id)}
                            disabled={isCreatingInvoice === gallery.id}
                            className="h-10 px-6 rounded-full bg-[#d64550] text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#c03945] transition-all shadow-[0_8px_20px_-4px_rgba(214,69,80,0.4)] disabled:opacity-50"
                          >
                            {isCreatingInvoice === gallery.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Plus className="h-3.5 w-3.5" />
                            )}
                            Create Invoice
                          </button>
                        ) : null}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <p className="text-[10px] font-bold text-slate-500 leading-tight max-w-[120px]">
                        {gallery.photographers}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        <GalleryStatusDropdown 
                          galleryId={gallery.id} 
                          currentStatus={gallery.status} 
                          user={user}
                        />
                        
                        {gallery.invoice && (
                          <span className={cn(
                            "inline-flex w-fit items-center rounded-md px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-tight border",
                            gallery.invoice.status === 'PAID' ? 'bg-blue-50 border-blue-100 text-blue-600' :
                            gallery.invoice.status === 'SENT' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' :
                            'bg-slate-50 border-slate-100 text-slate-500'
                          )}>
                            Invoice: {gallery.invoice.status}
                          </span>
                        )}

                        {gallery.deliveredAt && (
                          <p className="text-[8px] font-bold text-slate-400">
                            {format(new Date(gallery.deliveredAt), "dd/MM/yyyy HH:mm")}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 text-slate-400">
                        <div className="flex items-center gap-1">
                          <ImageIcon className="h-3 w-3" />
                          <span className="text-[10px] font-bold">{gallery.mediaCount}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Video className="h-3 w-3" />
                          <span className="text-[10px] font-bold">{gallery.videoCount}</span>
                        </div>
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
                    </td>
                    {user.role !== "CLIENT" && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleNotify(gallery.id)}
                            title="Notify Client Again"
                            className="h-8 w-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-primary hover:border-primary transition-all"
                          >
                            <Bell className="h-3.5 w-3.5" />
                          </button>
                          <Link 
                            href={`/gallery/${gallery.id}`} 
                            target="_blank"
                            className="h-8 w-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900 hover:border-slate-300 transition-all"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          <button 
                            onClick={() => handleEdit(gallery)}
                            className="h-8 w-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900 hover:border-slate-300 transition-all"
                          >
                            <Settings className="h-3.5 w-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDelete(gallery.id)}
                            className="h-8 w-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-all"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filteredGalleries.length === 0 && (
        <EmptyState 
          icon={ImageIcon}
          title={searchQuery ? "No matching galleries" : "No galleries yet"}
          description={searchQuery 
            ? "We couldn't find any galleries matching your search criteria. Try a different keyword." 
            : "Your production assets will appear here once they are delivered. Ready to create your first one?"}
          action={!searchQuery && user.role !== "CLIENT" ? {
            label: "Create Gallery",
            onClick: handleCreate,
            icon: Plus
          } : undefined}
        />
      )}

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="flex items-center justify-between border-t border-slate-100 pt-8">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} galleries
          </p>
          <div className="flex items-center gap-2">
            <button 
              disabled={pagination.page <= 1}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("page", String(pagination.page - 1));
                router.push(`${pathname}?${params.toString()}`);
              }}
              className="h-10 px-4 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-all"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.ceil(pagination.total / pagination.limit) }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("page", String(p));
                    router.push(`${pathname}?${params.toString()}`);
                  }}
                  className={cn(
                    "h-10 w-10 rounded-xl text-xs font-bold transition-all",
                    pagination.page === p 
                      ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
                      : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <button 
              disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("page", String(pagination.page + 1));
                router.push(`${pathname}?${params.toString()}`);
              }}
              className="h-10 px-4 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}

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

      <InvoicePreviewModal 
        isOpen={isPreviewOpen} 
        onClose={() => setIsPreviewOpen(false)} 
        invoice={selectedInvoice} 
      />
    </div>
  );
}

