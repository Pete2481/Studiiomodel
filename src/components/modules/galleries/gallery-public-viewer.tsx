"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  Camera, 
  Download, 
  Share2, 
  Maximize2, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Crop, 
  Check, 
  Loader2,
  Image as ImageIcon,
  Video as VideoIcon,
  Play,
  ArrowRight,
  ArrowLeft,
  Monitor,
  Smartphone, 
  Info, 
  Heart, 
  PenTool,
  Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getGalleryAssets } from "@/app/actions/dropbox";
import { toggleFavorite } from "@/app/actions/gallery";
import { createEditRequest } from "@/app/actions/edit-request";
import { permissionService } from "@/lib/permission-service";
import { DrawingCanvas } from "./drawing-canvas";
import { SocialCropper } from "./social-cropper";
import { DownloadManager } from "./download-manager";
import { VideoEditor } from "./video-editor";
import { ShareModal } from "./share-modal";

interface GalleryPublicViewerProps {
  gallery: any;
  tenant: any;
  editTags?: any[];
  user?: any;
  initialAssets?: any[];
  isShared?: boolean;
}

export function GalleryPublicViewer({ 
  gallery, 
  tenant, 
  editTags = [], 
  user,
  initialAssets = [],
  isShared = false
}: GalleryPublicViewerProps) {
  const router = useRouter();
  const [assets, setAssets] = useState<any[]>(initialAssets);
  const [videos, setVideos] = useState<any[]>(gallery.metadata?.videoLinks || []);
  const [activeVideoIdx, setActiveVideoIdx] = useState(0);
  const [isLoading, setIsLoading] = useState(initialAssets.length === 0);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "images" | "videos" | "favorites">("all");
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  const [hoveredVideoId, setHoveredVideoId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(gallery.initialFavorites || []);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState<string | null>(null);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [isAssetLoading, setIsAssetLoading] = useState(false);
  const [loadingDirection, setLoadingDirection] = useState<"prev" | "next" | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Helper to append shared flag and size for incognito access to locked galleries
  const getImageUrl = (url: string, size?: string) => {
    if (!url) return "";
    let finalUrl = url;
    
    // Add shared flag if it's a shared link
    if (isShared && !finalUrl.includes("shared=true")) {
      finalUrl += `${finalUrl.includes("?") ? "&" : "?"}shared=true`;
    }

    // Add size if provided and not already present
    if (size && !finalUrl.includes("size=")) {
      finalUrl += `${finalUrl.includes("?") ? "&" : "?"}size=${size}`;
    }

    return finalUrl;
  };

  // Downloads are visible to everyone (Public & Logged In)
  const canDownload = true;
  const canEdit = permissionService.can(user, "canEditRequests");

  // Pre-check for cached images
  useEffect(() => {
    if (selectedAsset && imgRef.current?.complete) {
      setIsAssetLoading(false);
      setLoadingDirection(null);
    }
  }, [selectedAsset]);

  // Swipe logic
  const touchStart = useRef<number | null>(null);
  const touchEnd = useRef<number | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    touchEnd.current = null;
    touchStart.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    const distance = touchStart.current - touchEnd.current;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isRightSwipe && !selectedAsset && !selectedVideo && !playingVideoId) {
      router.back();
    }
  };

  // Edit Request States
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingData, setDrawingData] = useState<any>(null);
  const [isRequestingEdit, setIsRequestingEdit] = useState(false);
  const [editNote, setEditNote] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editSuccess, setEditSuccess] = useState(false);
  const [isSocialCropperOpen, setIsSocialCropperOpen] = useState(false);
  const [isDownloadManagerOpen, setIsDownloadManagerOpen] = useState(false);
  const [downloadAssets, setDownloadAssets] = useState<any[]>([]);
  const [videoTimestamp, setVideoTimestamp] = useState<number | null>(null);
  const [videoComments, setVideoComments] = useState<any[]>([]);
  const [isVideoEditing, setIsVideoEditing] = useState(false);
  const [requestedFileUrls, setRequestedFileUrls] = useState<string[]>(
    gallery.initialEditRequests?.map((er: any) => er.fileUrl) || []
  );

  // ... existing loadAssets useEffect ...

  // Load real assets from multiple Dropbox folders
  useEffect(() => {
    // If we already have initial assets, we can skip the initial load
    // but we might still want to refresh if they are empty
    if (initialAssets.length > 0) {
      setIsLoading(false);
      return;
    }

    async function loadAssets() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getGalleryAssets(gallery.id);
        if (result.success) {
          setAssets(result.assets || []);
        } else {
          setError(result.error || "Failed to load assets from Dropbox");
          console.error("Asset Load Fail:", result.error);
        }
      } catch (err) {
        setError("A connection error occurred while syncing assets");
        console.error("Asset Load Error:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadAssets();
  }, [gallery.id, initialAssets]);

  const handleToggleFavorite = async (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    const itemId = item.id || item.url;
    const isFav = favorites.includes(itemId);
    
    // Optimistic Update
    setFavorites(prev => 
      isFav ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );

    setIsTogglingFavorite(itemId);
    try {
      const res = await toggleFavorite(gallery.id, itemId, item.path || item.url);
      if (!res.success) {
        // Rollback on failure
        setFavorites(prev => 
          isFav ? [...prev, itemId] : prev.filter(id => id !== itemId)
        );
        console.error("Fav toggle failed:", res.error);
      }
    } catch (err) {
      console.error("Fav error:", err);
      // Rollback on network error
      setFavorites(prev => 
        isFav ? [...prev, itemId] : prev.filter(id => id !== itemId)
      );
    } finally {
      setIsTogglingFavorite(null);
    }
  };

  const submitVideoComments = async (comments: any[], tagIds: string[] = []) => {
    setIsSubmittingEdit(true);
    try {
      // Create a SINGLE bundled edit request for the entire video
      await createEditRequest({
        galleryId: gallery.id,
        note: comments.map(c => `[${Math.floor(c.timestamp / 60)}:${(c.timestamp % 60).toString().padStart(2, '0')}] ${c.note}`).join(" - "),
        tagIds: tagIds, 
        fileUrl: selectedVideo.url,
        thumbnailUrl: undefined,
        metadata: {
          videoComments: comments, // Store the raw array for export/processing
          mediaType: "video",
          imageName: selectedVideo.title,
          folderName: "Production Film",
          isBundled: true
        }
      });
      
      setRequestedFileUrls(prev => [...prev, selectedVideo.url]);
      setEditSuccess(true);
      
      setTimeout(() => {
        setIsVideoEditing(false);
        setEditSuccess(false);
        setVideoComments([]);
      }, 2000);
    } catch (err) {
      console.error("Video edit error:", err);
      alert("Failed to submit video notes.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleSubmitEditRequest = async () => {
    if (selectedTagIds.length === 0 && !editNote && videoTimestamp === null && videoComments.length === 0) {
      alert("Please select at least one tag, add a note, or tag a time.");
      return;
    }

    setIsSubmittingEdit(true);
    try {
      const isVideo = !!selectedVideo;
      
      // If we have bundled video comments, we create one request per comment or a combined one? 
      // The old system likely created multiple markers. Let's create one request per bundled comment for video.
      if (isVideo && videoComments.length > 0) {
        for (const comment of videoComments) {
          await createEditRequest({
            galleryId: gallery.id,
            note: comment.note,
            tagIds: [], // Video comments don't need tags as per instruction
            fileUrl: selectedVideo.url,
            thumbnailUrl: undefined,
            metadata: {
              videoTimestamp: comment.timestamp,
              mediaType: "video",
              imageName: selectedVideo.title,
              folderName: "Production Film"
            }
          });
        }
        setRequestedFileUrls(prev => [...prev, selectedVideo.url]);
      } else {
        // Standard logic for single request
        const result = await createEditRequest({
          galleryId: gallery.id,
          note: editNote,
          tagIds: selectedTagIds,
          fileUrl: isVideo ? selectedVideo.url : selectedAsset.url,
          thumbnailUrl: isVideo ? null : (selectedAsset.thumbnailUrl || selectedAsset.url),
          metadata: {
            drawing: drawingData,
            videoTimestamp: videoTimestamp,
            mediaType: isVideo ? "video" : "image",
            imageName: isVideo ? selectedVideo.title : selectedAsset.name,
            folderName: isVideo ? "Production Film" : selectedAsset.folderName
          }
        });

        if (result.success) {
          setRequestedFileUrls(prev => [...prev, isVideo ? selectedVideo.url : selectedAsset.url]);
        } else {
          alert(result.error || "Failed to submit edit request.");
          setIsSubmittingEdit(false);
          return;
        }
      }

      setEditSuccess(true);
      setTimeout(() => {
        setIsRequestingEdit(false);
        setIsDrawingMode(false);
        setIsVideoEditing(false);
        setEditSuccess(false);
        setEditNote("");
        setSelectedTagIds([]);
        setDrawingData(null);
        setVideoTimestamp(null);
        setVideoComments([]);
      }, 2000);

    } catch (err) {
      console.error("Edit request error:", err);
      alert("An unexpected error occurred.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const filteredAssets = React.useMemo(() => assets.filter(a => {
    if (isShared) return favorites.includes(a.id);
    if (activeFilter === "videos") return false;
    if (activeFilter === "favorites") return favorites.includes(a.id);
    return true;
  }), [assets, activeFilter, favorites, isShared]);

  const displayVideos = React.useMemo(() => videos.filter((v, idx) => {
    const videoId = v.url || idx.toString();
    if (isShared) return favorites.includes(videoId);
    if (activeFilter === "images") return false;
    if (activeFilter === "favorites") return favorites.includes(videoId);
    return true;
  }), [videos, activeFilter, favorites, isShared]);

  const combinedMedia = React.useMemo(() => [
    ...displayVideos.map(v => ({ ...v, type: "video" })),
    ...filteredAssets.map(a => ({ ...a, type: "image" }))
  ], [displayVideos, filteredAssets]);

  return (
    <div 
      className="flex flex-col min-h-screen relative touch-pan-y"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Locked Overlay */}
      {gallery.isLocked && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-white/40 backdrop-blur-md" />
          <div className="relative bg-white rounded-[48px] shadow-[0_32px_128px_-12px_rgba(0,0,0,0.2)] border border-slate-100 p-12 max-w-xl w-full text-center space-y-8 animate-in zoom-in duration-500">
            <div className="h-24 w-24 rounded-[32px] bg-slate-50 flex items-center justify-center text-slate-300 mx-auto">
              <Lock className="h-10 w-10" />
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Gallery Protected</h1>
              <p className="text-slate-500 font-medium leading-relaxed">
                This collection requires authentication to access. Please log in to your studio portal to view and download these assets.
              </p>
            </div>
            <div className="pt-4 flex flex-col gap-3">
              <a 
                href="/login"
                className="h-14 rounded-2xl bg-slate-900 text-white font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow-xl shadow-slate-900/20"
              >
                Login to Studio Portal
                <ArrowRight className="h-4 w-4" />
              </a>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-4">
                Service Provided By {tenant.name}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Public Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.back()}
              className="h-10 w-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 hover:text-slate-900 transition-all mr-2"
              title="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.name} className="h-10 w-auto object-contain" />
            ) : (
              <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                <Camera className="h-5 w-5" />
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">{gallery.title}</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{gallery.client}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Step 1: Simple Share Selection Button */}
            {!isShared && (user?.role === "TENANT_ADMIN" || user?.role === "ADMIN" || user?.role === "AGENT") && favorites.length > 0 && (
              <button 
                onClick={() => {
                  const currentPath = window.location.pathname.replace(/\/$/, ""); // Remove trailing slash if any
                  const shareUrl = `${window.location.origin}${currentPath}/shared`;
                  navigator.clipboard.writeText(shareUrl);
                  setShowCopiedToast(true);
                  setTimeout(() => setShowCopiedToast(false), 3000);
                }}
                className="hidden md:flex h-10 px-6 rounded-full bg-rose-500 text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 hover:scale-105 active:scale-95 transition-all items-center gap-2"
              >
                <Heart className="h-3.5 w-3.5 fill-current" />
                Share Selection ({favorites.length})
              </button>
            )}

            {canDownload && (
              <button 
                onClick={() => {
                  setDownloadAssets(assets);
                  setIsDownloadManagerOpen(true);
                }}
                className="h-10 px-6 rounded-full bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-slate-900/10 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              >
                <Download className="h-3.5 w-3.5" />
                Download All
              </button>
            )}
            {!isShared && (
              <button 
                onClick={() => setIsShareModalOpen(true)}
                className="hidden md:flex h-10 w-10 rounded-full bg-white border border-slate-200 text-slate-400 items-center justify-center hover:text-slate-900 transition-colors shadow-sm"
              >
                <Share2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section: Banner First */}
      {gallery.bannerImageUrl ? (
        <section className="px-6 pt-6">
          <div className="max-w-7xl mx-auto relative h-[60vh] w-full overflow-hidden rounded-[48px] shadow-2xl shadow-slate-200">
            <img 
              src={gallery.bannerImageUrl} 
              alt={gallery.title}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10" />
            <div className="absolute bottom-12 left-12 text-white space-y-1 z-20">
              <h2 className="text-4xl font-bold tracking-tight">{gallery.title}</h2>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/80">By {gallery.teamMembers}</p>
            </div>
          </div>
        </section>
      ) : videos.length > 0 ? (
        <section className="px-6 pt-6">
          <div className="max-w-7xl mx-auto bg-black relative aspect-video w-full max-h-[70vh] overflow-hidden rounded-[48px] shadow-2xl group">
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
              <iframe 
                src={formatVideoUrl(videos[0].url)}
                className="w-full h-full border-0"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </section>
      ) : null}

      {/* Main Content */}
      <main className="flex-1 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-12">
          {/* Sub Header / Filters */}
          {!isShared && (
            <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6">
              <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100 flex-wrap justify-center">
                <FilterTab active={activeFilter === "all"} onClick={() => setActiveFilter("all")} label="Everything" count={assets.length + videos.length} />
                <FilterTab active={activeFilter === "images"} onClick={() => setActiveFilter("images")} label="Images" count={assets.length} />
                <FilterTab active={activeFilter === "videos"} onClick={() => setActiveFilter("videos")} label="Films" count={videos.length} />
                <FilterTab 
                  active={activeFilter === "favorites"} 
                  onClick={() => setActiveFilter("favorites")} 
                  label="Favourites" 
                  count={favorites.length}
                  isSpecial={true}
                />
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {/* Visual indicator of multiple folders */}
                  {Array.from(new Set(assets.map(a => a.folderName))).map((folder, i) => (
                    <div key={i} className="h-8 w-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-slate-400" title={folder}>
                      <ImageIcon className="h-3.5 w-3.5" />
                    </div>
                  ))}
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Aggregating from {Array.from(new Set(assets.map(a => a.folderName))).length} Production Folders
                </p>
              </div>
            </div>
          )}

          {isShared && (
            <div className="flex items-center justify-center mb-12">
              <div className="px-6 py-2 rounded-2xl bg-rose-50 border border-rose-100 flex items-center gap-3">
                <Heart className="h-4 w-4 text-rose-500 fill-current" />
                <span className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em]">Curated Selection ({combinedMedia.length})</span>
              </div>
            </div>
          )}

          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="aspect-[4/3] rounded-[32px] bg-slate-50 animate-pulse border border-slate-100 flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-slate-100" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="py-32 text-center max-w-md mx-auto">
              <div className="h-16 w-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Info className="h-8 w-8" />
              </div>
              <p className="text-sm font-bold text-slate-900 tracking-tight">{error}</p>
              <p className="text-xs font-medium text-slate-400 mt-2 mb-8">This usually happens if the Dropbox folder was moved, or the shared link has expired.</p>
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-slate-900 text-white rounded-full text-xs font-bold hover:bg-slate-800 transition-colors"
              >
                Retry Sync
              </button>
            </div>
          ) : (
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-8">
              {combinedMedia.map((item: any, idx: number) => (
                <div 
                  key={item.id || idx} 
                  className="break-inside-avoid relative rounded-[32px] overflow-hidden bg-slate-50 cursor-zoom-in border border-slate-100 group transition-all duration-500 hover:shadow-2xl hover:shadow-slate-200 mb-8"
                  onClick={() => {
                    if (item.type === "video") {
                      setPlayingVideoId(item.id || item.url);
                    } else {
                      setIsAssetLoading(true);
                      setSelectedAsset(item);
                    }
                  }}
                >
                  {item.type === "video" ? (
                    playingVideoId === (item.id || item.url) ? (
                      <div className="h-full w-full bg-black relative aspect-video">
                        <iframe 
                          src={formatVideoUrl(getImageUrl(item.url))}
                          className="w-full h-full border-0"
                          allow="autoplay; fullscreen; picture-in-picture"
                          allowFullScreen
                        />
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setPlayingVideoId(null);
                          }}
                          className="absolute top-4 right-4 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-md z-40 hover:bg-black transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div 
                        className="h-full w-full bg-slate-900 flex items-center justify-center relative group/vid aspect-video rounded-[32px] overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-primary/10 pointer-events-none z-10" />
                        
                        {/* Video Thumbnail: Use Banner Image if available */}
                        <div className="absolute inset-0 z-0 flex items-center justify-center">
                          {gallery.bannerImageUrl ? (
                            <img 
                              src={getImageUrl(gallery.bannerImageUrl)} 
                              alt="Video Thumbnail"
                              className="w-full h-full object-cover opacity-50 grayscale group-hover/vid:grayscale-0 group-hover/vid:opacity-100 transition-all duration-700"
                            />
                          ) : (
                            <div className="w-full h-full bg-slate-800" />
                          )}
                        </div>

                        <div className="relative z-20 h-16 w-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white scale-100 group-hover/vid:scale-110 group-hover/vid:bg-primary transition-all duration-500 shadow-xl border border-white/20">
                          <Play className="h-6 w-6 fill-current ml-1" />
                        </div>
                      </div>
                    )
                  ) : (
                    <ProgressiveImage 
                      src={getImageUrl(item.url)} 
                      alt={item.name}
                      className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  )}
                  
                  <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-all duration-300 pointer-events-none" />
                  
                  {/* Tag (Top Left - Hover Only) */}
                  {!isShared && (
                    <div className="absolute top-6 left-6 z-30 pointer-events-none">
                      <div className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-[9px] font-black text-white uppercase tracking-widest">
                          {item.type === "video" ? "FILM" : item.folderName}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Status Badges (Bottom Left - Hover Only) */}
                  {!isShared && requestedFileUrls.includes(item.url) && (
                    <div className="absolute bottom-6 left-6 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                      <div className="px-3 py-1.5 bg-rose-500/90 backdrop-blur-md rounded-full border border-rose-400/50 shadow-xl flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                        <p className="text-[9px] font-black text-white uppercase tracking-[0.1em]">
                          Edit Requested
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Hover Actions */}
                  <div className={cn(
                    "absolute bottom-6 left-6 right-6 flex items-center justify-end translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 z-30",
                    item.type === "video" && playingVideoId === (item.id || item.url) ? "hidden" : (item.type === "video" && "group-hover/vid:opacity-100")
                  )}>
                    <div className="flex gap-2 shrink-0">
                      {!isShared && (
                        <>
                          <button 
                            onClick={(e) => handleToggleFavorite(e, item)}
                            className={cn(
                              "h-9 w-9 rounded-xl flex items-center justify-center transition-all shadow-lg",
                              favorites.includes(item.id || item.url) 
                                ? "bg-rose-500 text-white" 
                                : "bg-white/20 backdrop-blur-md text-white hover:bg-white hover:text-rose-500"
                            )}
                          >
                            <Heart className={cn("h-4 w-4", favorites.includes(item.id || item.url) && "fill-current")} />
                          </button>
                          {item.type === "image" && (
                            <button className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center hover:bg-white hover:text-slate-900 transition-all">
                              <Crop className="h-4 w-4" />
                            </button>
                          )}
                        </>
                      )}
                      {item.type === "video" && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedVideo(item);
                          }}
                          className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center hover:bg-white hover:text-slate-900 transition-all"
                          title="Full Screen / Edit"
                        >
                          <Maximize2 className="h-4 w-4" />
                        </button>
                      )}
                      {canDownload && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDownloadAssets([item]);
                            setIsDownloadManagerOpen(true);
                          }}
                          className="h-9 w-9 rounded-xl bg-white text-slate-900 flex items-center justify-center hover:scale-110 transition-all shadow-lg shadow-black/20"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {!isLoading && activeFilter === "favorites" && combinedMedia.length === 0 && (
            <div className="py-32 text-center rounded-[48px] border-2 border-dashed border-slate-100 bg-slate-50/30 animate-in fade-in zoom-in duration-500">
              <div className="h-20 w-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                <Heart className="h-10 w-10" />
              </div>
              <p className="text-lg font-bold text-slate-900 tracking-tight">No favourites yet in this collaboration.</p>
              <p className="text-sm font-medium text-slate-400 mt-2 max-w-xs mx-auto">
                Click the heart icon on your favorite shots to save them here. Everyone with the link can see the same selection.
              </p>
            </div>
          )}

          {!isLoading && activeFilter !== "favorites" && assets.length === 0 && (
            <div className="py-32 text-center rounded-[48px] border-2 border-dashed border-slate-100 bg-slate-50/30">
              <ImageIcon className="h-12 w-12 text-slate-200 mx-auto mb-4" />
              <p className="text-sm font-bold text-slate-400">Your production assets haven't finished syncing yet.</p>
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-2">Check back in a few moments</p>
            </div>
          )}
        </div>
      </main>

      {/* Lightbox / Asset Viewer */}
      {selectedAsset && (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-in fade-in duration-300">
          <div className="flex items-center justify-between p-6 shrink-0 relative z-10">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => {
                  setSelectedAsset(null);
                  setIsAssetLoading(false);
                }}
                className="h-10 w-10 rounded-full bg-white/5 text-white flex items-center justify-center hover:bg-white/10 transition-all border border-white/5"
              >
                <X className="h-5 w-5" />
              </button>
              <div>
                <div className="flex items-center gap-3">
                  <p className="text-xs font-bold text-white tracking-tight">{selectedAsset.name}</p>
                  {!isShared && requestedFileUrls.includes(selectedAsset.url) && (
                    <span className="px-2 py-0.5 bg-rose-500 text-white text-[8px] font-black uppercase tracking-widest rounded-md">
                      Edit Requested
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  {isShared ? "Selected Item" : selectedAsset.folderName} &bull; Image {filteredAssets.indexOf(selectedAsset) + 1} of {filteredAssets.length}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!isShared && (
                <>
                  <button 
                    onClick={(e) => handleToggleFavorite(e, selectedAsset)}
                    className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center transition-all border shadow-lg",
                      favorites.includes(selectedAsset.id || selectedAsset.url)
                        ? "bg-rose-500 border-rose-400 text-white"
                        : "bg-white/5 border-white/10 text-white hover:bg-white hover:text-rose-500"
                    )}
                  >
                    <Heart className={cn("h-4 w-4", favorites.includes(selectedAsset.id || selectedAsset.url) && "fill-current")} />
                  </button>

                  {canEdit && (
                    <button 
                      onClick={() => {
                        setIsRequestingEdit(true);
                        setIsDrawingMode(false);
                      }}
                      className="h-10 px-6 rounded-full bg-white/10 text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-white hover:text-slate-900 transition-all border border-white/10"
                    >
                      <PenTool className="h-3.5 w-3.5" />
                      Request Edit
                    </button>
                  )}

                  <button 
                    onClick={() => setIsSocialCropperOpen(true)}
                    className="h-10 px-6 rounded-full bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-lg shadow-primary/20"
                  >
                    <Crop className="h-3.5 w-3.5" />
                    Social Cropper
                  </button>
                </>
              )}
              
              {canDownload && (
                <button 
                  onClick={() => {
                    setDownloadAssets([selectedAsset]);
                    setIsDownloadManagerOpen(true);
                  }}
                  className="h-10 px-6 rounded-full bg-white text-slate-900 text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 relative flex items-center justify-center p-8">
            <button 
              className={cn(
                "absolute left-6 h-14 w-14 rounded-full bg-white/5 text-white flex items-center justify-center hover:bg-white/10 transition-all border border-white/5 group z-20",
                isAssetLoading && loadingDirection === "prev" && "cursor-wait"
              )}
              onClick={(e) => {
                e.stopPropagation();
                // Allow clicking if we are not already loading this direction
                if (isAssetLoading && loadingDirection === "prev") return;
                
                const idx = filteredAssets.findIndex(a => a.url === selectedAsset.url);
                if (idx > 0) {
                  setIsAssetLoading(true);
                  setLoadingDirection("prev");
                  setSelectedAsset(filteredAssets[idx - 1]);
                }
              }}
            >
              {isAssetLoading && loadingDirection === "prev" ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <ChevronLeft className="h-8 w-8 group-hover:scale-110 transition-transform" />
              )}
            </button>
            
            <div className="relative group/main">
              <img 
                ref={imgRef}
                src={`${getImageUrl(selectedAsset.url)}&size=w1024h768`} 
                alt={selectedAsset.name}
                onLoad={() => {
                  setIsAssetLoading(false);
                  setLoadingDirection(null);
                }}
                onError={() => {
                  setIsAssetLoading(false);
                  setLoadingDirection(null);
                }}
                className="max-h-[85vh] max-w-full object-contain rounded-xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)]"
              />
              
              {/* Image Info Overlay on hover in Lightbox */}
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 opacity-0 group-hover/main:opacity-100 transition-opacity text-center">
                <p className="text-[9px] font-black text-white/80 uppercase tracking-widest flex items-center gap-2">
                  <Monitor className="h-3 w-3" />
                  High Definition Preview (1024px)
                </p>
                <p className="text-[7px] font-bold text-white/40 uppercase mt-0.5 tracking-tight">Full resolution available via download</p>
              </div>
            </div>

            <button 
              className={cn(
                "absolute right-6 h-14 w-14 rounded-full bg-white/5 text-white flex items-center justify-center hover:bg-white/10 transition-all border border-white/5 group z-20",
                isAssetLoading && loadingDirection === "next" && "cursor-wait"
              )}
              onClick={(e) => {
                e.stopPropagation();
                // Allow clicking if we are not already loading this direction
                if (isAssetLoading && loadingDirection === "next") return;

                const idx = filteredAssets.findIndex(a => a.url === selectedAsset.url);
                if (idx < filteredAssets.length - 1) {
                  setIsAssetLoading(true);
                  setLoadingDirection("next");
                  setSelectedAsset(filteredAssets[idx + 1]);
                }
              }}
            >
              {isAssetLoading && loadingDirection === "next" ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <ChevronRight className="h-8 w-8 group-hover:scale-110 transition-transform" />
              )}
            </button>
          </div>

          {/* Social Cropper Overlay - Still needs selectedAsset, but moved for cleaner hierarchy */}
          {isSocialCropperOpen && selectedAsset && (
            <SocialCropper 
              imageUrl={`${getImageUrl(selectedAsset.url)}&size=w2048h1536`}
              imageName={selectedAsset.name}
              onClose={() => setIsSocialCropperOpen(false)}
            />
          )}

          {/* Download Manager Overlay - Moved outside Lightbox */}

          {/* Edit Request Details Form (Slide-over style inside lightbox) */}
          {isRequestingEdit && (
            <div className="absolute inset-0 z-[60] flex items-center justify-end p-8 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300">
              <div 
                className="w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col h-full max-h-[700px] animate-in slide-in-from-right duration-500"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                      {drawingData ? "VISUAL INSTRUCTIONS ADDED" : "EDIT DETAILS"}
                    </p>
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">Request Revision</h3>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      setIsRequestingEdit(false);
                      setDrawingData(null);
                      setEditNote("");
                      setSelectedTagIds([]);
                    }}
                    className="h-10 w-10 rounded-full hover:bg-slate-50 flex items-center justify-center text-slate-400"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                  {/* Drawing Section (Optional) */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
                      Visual Marking (Optional)
                      {drawingData && (
                        <button 
                          type="button"
                          onClick={() => setIsDrawingMode(true)}
                          className="text-primary hover:underline text-[9px] font-black"
                        >
                          EDIT DRAWING
                        </button>
                      )}
                    </label>
                    
                    {drawingData ? (
                      <div 
                        onClick={() => setIsDrawingMode(true)}
                        className="aspect-square rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden relative group cursor-pointer"
                      >
                        <img src={`${selectedAsset.url}&size=w1024h768`} className="h-full w-full object-contain opacity-40" alt="Preview" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                            <PenTool className="h-5 w-5" />
                          </div>
                          <span className="text-[9px] font-black text-primary uppercase tracking-widest">Drawing Attached</span>
                        </div>
                      </div>
                    ) : (
                      <button 
                        type="button"
                        onClick={() => setIsDrawingMode(true)}
                        className="w-full aspect-square rounded-2xl border-2 border-dashed border-slate-100 hover:border-primary/30 hover:bg-primary/[0.02] transition-all flex flex-col items-center justify-center gap-3 group"
                      >
                        <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-primary group-hover:bg-primary/10 transition-all">
                          <PenTool className="h-5 w-5" />
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Draw on Photo</p>
                          <p className="text-[9px] font-medium text-slate-400 mt-1 max-w-[180px]">
                            Circle specific areas you want our editors to focus on.
                          </p>
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Edit Tags (Multi-select) */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Edit Type</label>
                    <div className="flex flex-wrap gap-2">
                      {editTags.map((tag: any) => {
                        const isSelected = selectedTagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedTagIds(prev => prev.filter(id => id !== tag.id));
                              } else {
                                setSelectedTagIds(prev => [...prev, tag.id]);
                              }
                            }}
                            className={cn(
                              "px-4 py-2 rounded-full text-[11px] font-bold transition-all border",
                              isSelected 
                                ? "bg-primary border-primary text-white shadow-lg shadow-primary/20" 
                                : "bg-white border-slate-200 text-slate-600 hover:border-primary hover:text-primary"
                            )}
                          >
                            {tag.name} (${tag.cost})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Note */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Additional Instructions</label>
                    <textarea 
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="e.g. Please remove the car and also the green bin on the left..."
                      className="w-full h-32 rounded-2xl border border-slate-200 p-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                    />
                  </div>
                </div>

                <div className="p-8 border-t border-slate-50 bg-slate-50/50">
                  {editSuccess ? (
                    <div className="h-14 w-full rounded-2xl bg-emerald-500 text-white flex items-center justify-center gap-2 animate-in zoom-in duration-300">
                      <Check className="h-5 w-5" />
                      <span className="font-bold">Request Submitted!</span>
                    </div>
                  ) : (
                    <button 
                      type="button"
                      onClick={handleSubmitEditRequest}
                      disabled={isSubmittingEdit || (selectedTagIds.length === 0 && !editNote)}
                      className="h-14 w-full rounded-2xl bg-slate-900 text-white font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow-xl disabled:opacity-50 disabled:hover:scale-100"
                    >
                      {isSubmittingEdit ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          Submit Edit Request
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Drawing Mode Overlay - Rendered AFTER everything with top-tier Z-index */}
          {isDrawingMode && (
            <DrawingCanvas 
              imageUrl={`${getImageUrl(selectedAsset.url)}&size=w2048h1536`}
              onSave={(data) => {
                setDrawingData(data);
                setIsDrawingMode(false);
                setIsRequestingEdit(true);
              }}
              onCancel={() => {
                setIsDrawingMode(false);
                setIsRequestingEdit(true);
              }}
            />
          )}
        </div>
      )}

      {/* Video Lightbox */}
      {selectedVideo && (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-in fade-in duration-300">
          <div className="flex items-center justify-between p-6 shrink-0 relative z-10">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => {
                  setSelectedVideo(null);
                  setVideoTimestamp(null);
                  setIsRequestingEdit(false);
                }}
                className="h-10 w-10 rounded-full bg-white/5 text-white flex items-center justify-center hover:bg-white/10 transition-all border border-white/5"
              >
                <X className="h-5 w-5" />
              </button>
              <div>
                <div className="flex items-center gap-3">
                  <p className="text-xs font-bold text-white tracking-tight">{selectedVideo.title}</p>
                  {requestedFileUrls.includes(selectedVideo.url) && (
                    <span className="px-2 py-0.5 bg-rose-500 text-white text-[8px] font-black uppercase tracking-widest rounded-md">
                      Edit Requested
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  Production Film &bull; {videos.indexOf(selectedVideo) + 1} of {videos.length}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {canEdit && (
                <button 
                  onClick={() => {
                    setIsVideoEditing(true);
                  }}
                  className="h-10 px-6 rounded-full bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-lg shadow-primary/20"
                >
                  <PenTool className="h-3.5 w-3.5" />
                  Add Edit Notes
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 relative flex items-center justify-center p-8 lg:p-20">
            <div className="w-full h-full max-w-6xl aspect-video rounded-3xl overflow-hidden shadow-2xl bg-black border border-white/5">
              <iframe 
                src={formatVideoUrl(selectedVideo.url)}
                className="w-full h-full border-0"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>

          {/* Edit Request Details Form (Slide-over style inside lightbox) */}
          {isRequestingEdit && (
            <div className="absolute inset-0 z-[120] flex items-center justify-end p-8 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300">
              <div 
                className="w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col h-full max-h-[700px] animate-in slide-in-from-right duration-500"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest tracking-widest">VIDEO EDIT REQUEST</p>
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">Request Revision</h3>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      setIsRequestingEdit(false);
                      setEditNote("");
                      setSelectedTagIds([]);
                      setVideoTimestamp(null);
                    }}
                    className="h-10 w-10 rounded-full hover:bg-slate-50 flex items-center justify-center text-slate-400"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                  {/* Timestamp Input (Manual for now to match high-speed requirement) */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Timestamp (MM:SS)</label>
                    <div className="flex gap-2">
                       <input 
                         type="text"
                         placeholder="e.g. 01:25"
                         className="flex-1 h-12 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all"
                         onChange={(e) => {
                           const parts = e.target.value.split(':');
                           if (parts.length === 2) {
                             const mins = parseInt(parts[0]);
                             const secs = parseInt(parts[1]);
                             if (!isNaN(mins) && !isNaN(secs)) {
                               setVideoTimestamp(mins * 60 + secs);
                             }
                           }
                         }}
                       />
                       <div className="h-12 px-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                         Seconds: {videoTimestamp || 0}
                       </div>
                    </div>
                    <p className="text-[9px] font-medium text-slate-400 italic">Enter the time in the video where you'd like a change.</p>
                  </div>

                  {/* Edit Tags (Multi-select) */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Edit Type</label>
                    <div className="flex flex-wrap gap-2">
                      {editTags.map((tag: any) => {
                        const isSelected = selectedTagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedTagIds(prev => prev.filter(id => id !== tag.id));
                              } else {
                                setSelectedTagIds(prev => [...prev, tag.id]);
                              }
                            }}
                            className={cn(
                              "px-4 py-2 rounded-full text-[11px] font-bold transition-all border",
                              isSelected 
                                ? "bg-primary border-primary text-white shadow-lg shadow-primary/20" 
                                : "bg-white border-slate-200 text-slate-600 hover:border-primary hover:text-primary"
                            )}
                          >
                            {tag.name} (${tag.cost})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Note */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Additional Instructions</label>
                    <textarea 
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="e.g. Please swap this clip with the one of the master bedroom..."
                      className="w-full h-32 rounded-2xl border border-slate-200 p-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                    />
                  </div>
                </div>

                <div className="p-8 border-t border-slate-50 bg-slate-50/50">
                  {editSuccess ? (
                    <div className="h-14 w-full rounded-2xl bg-emerald-500 text-white flex items-center justify-center gap-2 animate-in zoom-in duration-300">
                      <Check className="h-5 w-5" />
                      <span className="font-bold">Request Submitted!</span>
                    </div>
                  ) : (
                    <button 
                      type="button"
                      onClick={handleSubmitEditRequest}
                      disabled={isSubmittingEdit || (selectedTagIds.length === 0 && !editNote && videoTimestamp === null)}
                      className="h-14 w-full rounded-2xl bg-slate-900 text-white font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow-xl disabled:opacity-50 disabled:hover:scale-100"
                    >
                      {isSubmittingEdit ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          Submit Edit Request
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Video Editing Workspace (Frame.io Style) */}
      {isVideoEditing && selectedVideo && (
        <VideoEditor 
          videoUrl={selectedVideo.url}
          videoTitle={selectedVideo.title}
          onClose={() => {
            setIsVideoEditing(false);
            setVideoComments([]);
          }}
          onSend={(comments, tagIds) => {
            // We need to set comments AND then trigger submission.
            // Since setVideoComments is async, we can pass it to handleSubmitEditRequest 
            // if we refactor it slightly.
            submitVideoComments(comments, tagIds);
          }}
          isSubmitting={isSubmittingEdit}
          editSuccess={editSuccess}
          editTags={editTags}
        />
      )}

      {/* Simple Footer */}
      <footer className="py-20 border-t border-slate-100 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-6 text-center">
          {tenant.logoUrl && (
            <img src={tenant.logoUrl} alt={tenant.name} className="h-12 w-auto mx-auto mb-8 opacity-40 grayscale" />
          )}
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">
            Production by {tenant.name}
          </p>
          <div className="flex items-center justify-center gap-6">
            <a 
              href={(tenant.settings as any)?.privacyPolicyUrl || "#"} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-slate-900 transition-colors"
            >
              Privacy Policy
            </a>
            <a 
              href={(tenant.settings as any)?.termsOfUseUrl || "#"} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-slate-900 transition-colors"
            >
              Terms of Use
            </a>
            <a 
              href={(tenant.settings as any)?.contactStudioUrl || "#"} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-slate-900 transition-colors"
            >
              Contact Studio
            </a>
          </div>
        </div>
      </footer>

      {/* Download Manager Overlay - Moved outside Lightbox to work with "Download All" */}
      {isDownloadManagerOpen && (
        <DownloadManager 
          galleryId={gallery.id}
          assets={downloadAssets}
          sharedLink={gallery.metadata?.dropboxLink}
          onClose={() => setIsDownloadManagerOpen(false)}
          clientBranding={gallery.clientBranding}
        />
      )}

      {isShareModalOpen && (
        <ShareModal 
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          galleryTitle={gallery.title}
          shareUrl={typeof window !== 'undefined' ? window.location.href : ""}
          tenantName={tenant.name}
        />
      )}

      {/* Copied Toast */}
      {showCopiedToast && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[150] animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-slate-900/90 backdrop-blur-xl text-white px-6 py-4 rounded-[24px] shadow-2xl flex items-center gap-4 border border-white/10 min-w-[320px]">
            <div className="h-10 w-10 rounded-xl bg-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/20 shrink-0">
              <Check className="h-5 w-5 text-white stroke-[3]" />
            </div>
            <div className="space-y-0.5">
              <p className="text-[11px] font-black uppercase tracking-widest text-white/50">Success</p>
              <p className="text-sm font-bold tracking-tight">Curated link copied to clipboard</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterTab({ active, onClick, label, count, isSpecial }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3",
        active 
          ? "bg-white text-slate-900 shadow-xl shadow-slate-200/50 border border-slate-100" 
          : "text-slate-400 hover:text-slate-600",
        isSpecial && active && "text-rose-500"
      )}
    >
      {label}
      <span className={cn(
        "h-4.5 min-w-[20px] px-1.5 rounded-lg flex items-center justify-center text-[9px] font-black",
        active 
          ? (isSpecial ? "bg-rose-500 text-white" : "bg-primary text-white") 
          : "bg-slate-200 text-slate-400"
      )}>
        {count}
      </span>
    </button>
  );
}

/**
 * Progressive Image Loader
 * Loads a tiny "Spark" thumb first, then swaps for a high-res one
 */
function ProgressiveImage({ src, alt, className }: { src: string, alt: string, className: string }) {
  const [currentSrc, setCurrentSrc] = useState(`${src}${src.includes('?') ? '&' : '?'}size=w64h64`);
  const [isHighResLoaded, setIsHighResLoaded] = useState(false);

  useEffect(() => {
    // Start loading the medium-res version immediately
    const highRes = new Image();
    highRes.src = `${src}${src.includes('?') ? '&' : '?'}size=w480h320`;
    highRes.onload = () => {
      setCurrentSrc(highRes.src);
      setIsHighResLoaded(true);
    };
  }, [src]);

  return (
    <div className="relative w-full overflow-hidden rounded-[32px] bg-slate-50 min-h-[250px] flex items-center justify-center">
      <img 
        src={currentSrc} 
        alt={alt}
        className={cn(
          className,
          "transition-all duration-700 w-full",
          !isHighResLoaded ? "blur-xl scale-110 opacity-50" : "blur-0 scale-100 opacity-100"
        )}
        loading="lazy"
      />
      {!isHighResLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-200" />
        </div>
      )}
    </div>
  );
}

/**
 * Helper to format Vimeo/YouTube/Dropbox links for iframe hero player
 */
function formatVideoUrl(url: string) {
  if (!url) return "";
  
  // Vimeo
  if (url.includes("vimeo.com")) {
    const id = url.split("/").pop();
    return `https://player.vimeo.com/video/${id}?autoplay=1&badge=0&autopause=0&player_id=0&app_id=58479`;
  }
  
  // YouTube
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    const id = url.includes("v=") ? url.split("v=")[1].split("&")[0] : url.split("/").pop();
    return `https://www.youtube.com/embed/${id}?autoplay=1&modestbranding=1`;
  }
  
  // Dropbox
  if (url.includes("dropbox.com")) {
    return url.replace("www.dropbox.com", "dl.dropboxusercontent.com").replace("dl=0", "raw=1");
  }
  
  return url;
}

