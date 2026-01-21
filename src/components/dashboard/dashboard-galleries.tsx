"use client";

import React, { useState, useEffect, startTransition, useRef } from "react";
import { Plus, Search, Filter, Image as ImageIcon, Video, MoreHorizontal, ExternalLink, Settings, Trash2, ArrowRight, Heart, Lock, ShieldCheck, ChevronDown, Loader2, Folder } from "lucide-react";
import { cn, formatDropboxUrl, cleanDropboxLink } from "@/lib/utils";
import { generateListingCopy, saveGalleryCopy } from "@/app/actions/listing-copy";
import { Sparkles, FileText } from "lucide-react";
import { AIListingModal } from "../modules/galleries/ai-listing-modal";
import { GalleryDrawer } from "../modules/galleries/gallery-drawer";
import { GalleryStatusDropdown } from "../modules/galleries/gallery-status-dropdown";
import { deleteGallery, notifyGalleryClient, refreshGalleryCounts, getGalleryReferenceData } from "@/app/actions/gallery";
import Link from "next/link";
import { Hint } from "@/components/ui";
import { Bell } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface DashboardGalleriesProps {
  initialGalleries: any[];
  user: any;
  isActionLocked?: boolean;
}

export function DashboardGalleries({ 
  initialGalleries, 
  user,
  isActionLocked = false
}: DashboardGalleriesProps) {
  const router = useRouter();
  const [galleries, setGalleries] = useState(initialGalleries);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedGallery, setSelectedGallery] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [activeCopyGallery, setActiveCopyGallery] = useState<any>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [loadedCovers, setLoadedCovers] = useState<Set<string>>(new Set());
  const [refData, setRefData] = useState<{
    clients: any[];
    services: any[];
    agents: any[];
    bookings: any[];
  } | null>(null);
  const refDataPromiseRef = useRef<Promise<any> | null>(null);

  // Hydrate cached reference data after mount (avoid hydration mismatch).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("studiio:galleryRefData");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { ts: number; data: any };
      if (!parsed?.data) return;
      // 10 minute TTL
      if (parsed?.ts && Date.now() - parsed.ts > 10 * 60 * 1000) return;
      setRefData(parsed.data);
    } catch {
      // ignore cache failures
    }
  }, []);

  // Helper to get optimized proxy URLs
  const getImageUrl = (url: string, galleryId: string, size: string = "w640h480") => {
    if (!url) return "";
    
    // If it's already a proxy URL, just return it
    if (url.startsWith('/api/')) return url;

    // If it's a Dropbox link, use the proxy
    if (url.includes("dropbox.com") || url.includes("dropboxusercontent.com")) {
      // Normalize to www.dropbox.com and remove query params for the base shared link
      const cleanUrl = cleanDropboxLink(url);
      // Use path=/ for direct file shared links (Dropbox API requirement)
      return `/api/dropbox/assets/${galleryId}?path=/&sharedLink=${encodeURIComponent(cleanUrl)}&size=${size}&shared=true`;
    }

    // If it's a Google Drive link, use the proxy
    if (url.includes("drive.google.com") || url.includes("googleusercontent.com")) {
      const gDriveMatch = url.match(/\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
      const gDriveId = gDriveMatch?.[1];
      if (gDriveId) {
        return `/api/google-drive/assets/${galleryId}?id=${gDriveId}&size=${size}`;
      }
    }

    return url;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openMenuId && !(event.target as Element).closest('.gallery-menu-container')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId]);

  // Keep local list in sync with server-refreshed props (router.refresh()) while preserving any optimistic temp cards.
  useEffect(() => {
    setGalleries((prev: any[]) => {
      const optimistic = (prev || []).filter((g: any) => String(g?.id || "").startsWith("temp:") || g?.__optimistic);
      const next = Array.isArray(initialGalleries) ? initialGalleries : [];
      if (optimistic.length === 0) return next;
      const nextIds = new Set(next.map((g: any) => String(g?.id)));
      const keepOptimistic = optimistic.filter((g: any) => !nextIds.has(String(g?.id)));
      return [...keepOptimistic, ...next];
    });
  }, [initialGalleries]);

  const ensureRefData = async () => {
    if (refData) return refData;
    if (refDataPromiseRef.current) return await refDataPromiseRef.current;

    refDataPromiseRef.current = (async () => {
      const res = await getGalleryReferenceData();
      if (res?.success && res?.data) {
        const data = {
          clients: res.data.clients || [],
          services: res.data.services || [],
          agents: res.data.agents || [],
          bookings: res.data.bookings || [],
        };
        setRefData(data);
        try {
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem("studiio:galleryRefData", JSON.stringify({ ts: Date.now(), data }));
          }
        } catch {
          // ignore cache failures
        }
        return data;
      }
      return null;
    })().finally(() => {
      refDataPromiseRef.current = null;
    });

    return await refDataPromiseRef.current;
  };

  // Prefetch gallery reference data (clients/services/agents/bookings) in the background for instant drawer UX.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // If we already have cached data, still refresh in background once per mount.
        const data = await ensureRefData();
        if (cancelled) return;
        if (!data) return;
      } catch {
        // best-effort prefetch; ignore errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Best-effort background refresh: update counts for visible galleries that still show 0.
  useEffect(() => {
    const candidates = (galleries || [])
      .filter((g: any) => Number(g?.mediaCount || 0) === 0 && (g?.metadata?.dropboxLink || (g?.metadata?.imageFolders?.length || 0) > 0))
      .map((g: any) => String(g.id))
      .slice(0, 12);
    if (candidates.length === 0) return;

    const t = window.setTimeout(async () => {
      try {
        const res = await refreshGalleryCounts(candidates);
        if (res?.success) startTransition(() => router.refresh());
      } catch (e) {
        // non-blocking
      }
    }, 700);

    return () => window.clearTimeout(t);
  }, [galleries, router]);

  const handleCreate = () => {
    setSelectedGallery(null);
    // Kick off prefetch immediately (so client list is ready before dropdown click)
    // Don't block opening the drawer; we also start prefetch on hover/focus below.
    void ensureRefData();
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

  const handleOptimisticCreate = (tempGallery: any) => {
    setGalleries((prev: any[]) => [tempGallery, ...(prev || [])]);
  };

  const handleOptimisticResolve = (tempId: string, result: any) => {
    const summary = result?.gallerySummary;
    const finalId = String(result?.galleryId || summary?.id || "");
    setGalleries((prev: any[]) =>
      (prev || []).map((g: any) => {
        if (String(g?.id) !== String(tempId)) return g;
        const merged = {
          ...g,
          ...(summary || {}),
          id: finalId || g.id,
          __optimistic: false,
        };
        return merged;
      })
    );
    startTransition(() => router.refresh());
  };

  const handleOptimisticFail = (tempId: string, error: string) => {
    setGalleries((prev: any[]) => (prev || []).filter((g: any) => String(g?.id) !== String(tempId)));
    alert(error || "Failed to save gallery");
  };

  const filteredGalleries = galleries.filter(g => 
    g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.property.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 18); // Default dashboard layout: 6x3 (18)

  return (
    <section className="space-y-6 w-full max-w-full overflow-hidden">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Featured galleries</h2>
          <p className="text-sm font-medium text-slate-500">Latest image collections ready for client delivery.</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link 
            href="/tenant/galleries"
            prefetch={false}
            className="h-10 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 rounded-full px-4 sm:px-5 text-xs font-bold transition-all active:scale-95 flex items-center gap-2 flex-1 sm:flex-none justify-center"
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
                onMouseEnter={() => {
                  if (isActionLocked) return;
                  void ensureRefData();
                }}
                onFocus={() => {
                  if (isActionLocked) return;
                  void ensureRefData();
                }}
                onPointerDown={() => {
                  if (isActionLocked) return;
                  void ensureRefData();
                }}
                onClick={() => {
                  if (isActionLocked) {
                    window.location.href = "/tenant/settings?tab=billing";
                    return;
                  }
                  handleCreate();
                }}
                className={cn(
                  "h-10 bg-[var(--primary)] hover:opacity-90 text-white rounded-full px-4 sm:px-5 text-xs font-bold transition-all shadow-lg shadow-primary/20 active:scale-95 flex items-center gap-2 flex-1 sm:flex-none justify-center whitespace-nowrap",
                  isActionLocked && "opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all"
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                {isActionLocked ? "Sub Required" : "Add gallery"}
              </button>
            </Hint>
          )}
        </div>
      </header>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 w-full">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search galleries..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ui-input w-full pl-11" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 w-full gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {filteredGalleries.map((gallery: any, idx: number) => (
          (() => {
            const status = String(gallery?.status || "").toUpperCase();
            const isDeliveredish = status === "DELIVERED" || status === "APPROVED" || status === "CONFIRMED";
            const localBorder = isDeliveredish ? "border-emerald-400" : "border-rose-400";
            return (
          <div
            key={gallery.id}
            className={cn(
              "group relative flex flex-col overflow-hidden bg-white transition-all hover:shadow-xl hover:shadow-slate-200/50",
              "rounded-[24px] border",
              localBorder
            )}
          >
            {/* Cover Image */}
            <div className="overflow-hidden relative bg-slate-100 aspect-[16/10]">
              {(() => {
                const coverUrl = gallery.cover;
                const formattedUrl = formatDropboxUrl(coverUrl);
                const isLikelyFolder = formattedUrl?.includes("/drive/folders/") || formattedUrl?.includes("/drive/u/");
                
                if (isLikelyFolder) {
                  return (
                    <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-slate-50 border-b border-slate-100">
                      <Folder className="h-8 w-8 text-slate-300" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Production Folder</span>
                    </div>
                  );
                }

                const hasCover = !!String(coverUrl || "").trim();
                const coverLoaded = loadedCovers.has(String(gallery.id));

                // Show a subtle loading placeholder so it never looks broken/blank.
                const LoadingPlaceholder = (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 animate-in fade-in duration-500">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Loader2 className="h-7 w-7 animate-spin opacity-70" />
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
                        {hasCover ? "Loading cover" : "Cover pending"}
                      </span>
                    </div>
                  </div>
                );

                if (!hasCover) return LoadingPlaceholder;

                const optimizedCoverUrl = getImageUrl(coverUrl, gallery.id, "w640h480");
                const finalSrc = failedImages.has(gallery.id) ? formattedUrl : optimizedCoverUrl;

                return (
                  <>
                    {!coverLoaded ? LoadingPlaceholder : null}
                    <Image 
                      src={finalSrc}
                      alt={gallery.title} 
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                      className={cn(
                        "object-cover transition-transform duration-500 group-hover:scale-110",
                        "transition-opacity duration-700",
                        coverLoaded ? "opacity-100" : "opacity-0"
                      )}
                      priority={idx < 4}
                      onLoadingComplete={() => {
                        setLoadedCovers((prev) => {
                          const next = new Set(prev);
                          next.add(String(gallery.id));
                          return next;
                        });
                      }}
                      onError={() => {
                        setFailedImages(prev => {
                          const next = new Set(prev);
                          next.add(gallery.id);
                          return next;
                        });
                      }}
                    />
                  </>
                );
              })()}
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
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 group-hover:text-primary transition-colors line-clamp-1">{gallery.title}</h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight mt-0.5 truncate">
                    By {gallery.photographers || "Unknown"}
                  </p>
                </div>
                {user.role !== "CLIENT" && (
                  <div className="relative gallery-menu-container">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === gallery.id ? null : gallery.id);
                      }}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                        openMenuId === gallery.id ? "bg-slate-100 text-slate-900" : "hover:bg-slate-100 text-slate-400"
                      )}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {openMenuId === gallery.id && (
                      <div className="absolute right-0 bottom-full mb-2 z-[100]">
                        <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-slate-100 py-1 min-w-[180px] animate-in fade-in slide-in-from-bottom-4 duration-300">
                          <button 
                            onClick={() => {
                              setActiveCopyGallery(gallery);
                              setIsCopyModalOpen(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-5 py-4 text-left text-xs font-bold text-[var(--primary)] hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50 pb-4"
                          >
                            <Sparkles className="h-4 w-4" />
                            Write Copy
                          </button>
                          <button 
                            onClick={() => {
                              handleNotify(gallery.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-5 py-4 text-left text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50"
                          >
                            <Bell className="h-4 w-4" />
                            Notify Again
                          </button>
                          <button 
                            onClick={() => {
                              handleDelete(gallery.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-5 py-4 text-left text-xs font-bold text-rose-500 hover:bg-rose-50 flex items-center gap-3"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
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
            );
          })()
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
        initialGallery={selectedGallery}
        onRefresh={() => startTransition(() => router.refresh())}
        prefetchedClients={refData?.clients || []}
        prefetchedServices={refData?.services || []}
        prefetchedAgents={refData?.agents || []}
        prefetchedBookings={refData?.bookings || []}
        onOptimisticCreate={handleOptimisticCreate}
        onOptimisticResolve={handleOptimisticResolve}
        onOptimisticFail={handleOptimisticFail}
      />

      {isCopyModalOpen && activeCopyGallery && (
        <AIListingModal
          isOpen={isCopyModalOpen}
          onClose={() => {
            setIsCopyModalOpen(false);
            setActiveCopyGallery(null);
          }}
          galleryId={activeCopyGallery.id}
          galleryTitle={activeCopyGallery.title}
          initialCopy={activeCopyGallery.aiCopy}
          isPublished={activeCopyGallery.isCopyPublished}
        />
      )}
    </section>
  );
}

