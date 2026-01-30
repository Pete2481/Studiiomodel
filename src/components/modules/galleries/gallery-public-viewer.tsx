"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import dynamic from "next/dynamic";
import { 
  Camera, 
  Download, 
  Share2, 
  Maximize2, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Crop, 
  Pencil,
  Check, 
  Loader2,
  Image as ImageIcon,
  Video as VideoIcon,
  Play,
  ArrowRight,
  ArrowLeft,
  Monitor,
  Smartphone,
  Instagram,
  Sparkles,
  Info, 
  Heart, 
  PenTool,
  Lock,
  Zap,
  FileText,
  MapPin,
  BoxSelect,
  Film,
  Moon,
  Square,
  Sofa,
  Trash2,
  Eraser,
  Wand2,
  Sliders
} from "lucide-react";
import { cn, formatDropboxUrl, cleanDropboxLink } from "@/lib/utils";
import { getGalleryAssets } from "@/app/actions/storage";
import { toggleFavorite } from "@/app/actions/gallery";
import { createEditRequest } from "@/app/actions/edit-request";
import { runAiSuiteSpotRemoval, unlockAiSuiteForGallery } from "@/app/actions/ai-suite";
import { permissionService } from "@/lib/permission-service";
import { CameraLoader } from "@/components/ui/camera-loader";
import type { ProAnnotationCanvasHandle } from "./pro-annotation-canvas";
import { generateSocialEditBlob, SOCIAL_ADJUSTMENTS, SOCIAL_PRESETS, type SocialEditorState } from "./social-cropper";
import type { DrawingCanvasHandle } from "./drawing-canvas";

// Lazy-load heavy components to reduce TBT (Total Blocking Time)
const DrawingCanvas = dynamic(() => import("./drawing-canvas").then(m => m.DrawingCanvas), { ssr: false });
const SocialCropper = dynamic(() => import("./social-cropper").then(m => m.SocialCropper), { ssr: false });
const DownloadManager = dynamic(() => import("./download-manager").then(m => m.DownloadManager), { ssr: false });
const VideoEditor = dynamic(() => import("./video-editor").then(m => m.VideoEditor), { ssr: false });
const ShareModal = dynamic(() => import("./share-modal").then(m => m.ShareModal), { ssr: false });
const AISuiteDrawer = dynamic(() => import("./ai-suite-drawer").then(m => m.AISuiteDrawer), { ssr: false });
const AISocialVideoPicker = dynamic(() => import("./ai-social-video-picker").then(m => m.AISocialVideoPicker), { ssr: false });
const ProAnnotationCanvas = dynamic(() => import("./pro-annotation-canvas").then(m => m.ProAnnotationCanvas), { ssr: false });

interface GalleryPublicViewerProps {
  gallery: any;
  tenant: any;
  editTags?: any[];
  user?: any;
  initialAssets?: any[];
  initialCursor?: string | null;
  isShared?: boolean;
  /** When provided, indicates why the initial SSR asset fetch returned empty. */
  initialAssetsError?: string | null;
  /**
   * Optional viewer config to support the V2 gallery route without changing V1 defaults.
   */
  viewerConfig?: {
    /** Page size for server pagination (cursor-based) */
    pageSize?: number;
    /** How many items to reveal per IntersectionObserver tick (in-memory) */
    revealStep?: number;
    /** Run a full refresh scan on open (V1 behavior). V2 disables to avoid blank/reorder. */
    refreshAssetsOnOpen?: boolean;
    /** Use progressive low->high banner fade */
    progressiveBanner?: boolean;
  };
}

export function GalleryPublicViewer({ 
  gallery, 
  tenant, 
  editTags = [], 
  user: initialUser,
  initialAssets = [],
  initialCursor = null,
  isShared = false,
  initialAssetsError = null,
  viewerConfig
}: GalleryPublicViewerProps) {
  const pageSize = viewerConfig?.pageSize ?? 24;
  const revealStep = viewerConfig?.revealStep ?? 24;
  const refreshAssetsOnOpen = viewerConfig?.refreshAssetsOnOpen ?? true;
  const progressiveBanner = viewerConfig?.progressiveBanner ?? false;

  const router = useRouter();
  const [assets, setAssets] = useState<any[]>(initialAssets);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [user, setUser] = useState<any>(initialUser);
  const [videos, setVideos] = useState<any[]>(gallery.metadata?.videoLinks || []);
  const [activeVideoIdx, setActiveVideoIdx] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "images" | "videos" | "favorites">("all");
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  const [hoveredVideoId, setHoveredVideoId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(gallery.initialFavorites || []);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState<string | null>(null);
  const [isAssetLoading, setIsAssetLoading] = useState(false);
  const [loadingDirection, setLoadingDirection] = useState<"prev" | "next" | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isAISuiteOpen, setIsAISuiteOpen] = useState(false);
  const [isAiSuiteUnlockOpen, setIsAiSuiteUnlockOpen] = useState(false);
  const [aiSuiteTermsAccepted, setAiSuiteTermsAccepted] = useState(false);
  const [isAiSuiteUnlocking, setIsAiSuiteUnlocking] = useState(false);
  const [aiSuiteUnlockError, setAiSuiteUnlockError] = useState<string | null>(null);
  // AI suite is prompt-only (no masking) per product requirement
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  // Choice modal removed in favor of a Lightroom-style top toolbar
  const [isAnnotationOpen, setIsAnnotationOpen] = useState(false);
  const [annotationData, setAnnotationData] = useState<any>(null);
  const [isAiSocialVideoOpen, setIsAiSocialVideoOpen] = useState(false);
  const [aiSocialVideoError, setAiSocialVideoError] = useState<string | null>(null);
  const [isAiSocialVideoGenerating, setIsAiSocialVideoGenerating] = useState(false);
  const [postUnlockAction, setPostUnlockAction] = useState<
    null | "ai_social_video" | "ai_day_to_dusk" | "ai_remove_furniture" | "ai_replace_furniture" | "ai_advanced_prompt" | "ai_spot_removal"
  >(null);
  const [aiRequestedAction, setAiRequestedAction] = useState<
    null | "day_to_dusk" | "remove_furniture" | "replace_furniture" | "advanced_prompt" | "spot_removal"
  >(null);
  const [aiRequestedNonce, setAiRequestedNonce] = useState(0);
  const [socialInitialTab, setSocialInitialTab] = useState<"crop" | "adjust">("crop");
  const [annotationInitialTool, setAnnotationInitialTool] = useState<"select" | "pin" | "boundary" | "text">("select");

  type EditorTool = "none" | "social" | "color" | "pin" | "boundary" | "ai" | "spot" | "request";
  const [activeTool, setActiveTool] = useState<EditorTool>("none");

  type ImageVersion = {
    id: string;
    label: string;
    tool: EditorTool;
    kind: "url" | "blob";
    src: string; // URL or objectURL for blob
    blob?: Blob;
    createdAt: number;
  };
  const [versionsByAssetId, setVersionsByAssetId] = useState<Record<string, ImageVersion[]>>({});
  const [activeVersionIdByAssetId, setActiveVersionIdByAssetId] = useState<Record<string, string>>({});
  const blobUrlRegistryRef = useRef<Set<string>>(new Set());
  const [bannerFailed, setBannerFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const [showRefreshToast, setShowRefreshToast] = useState(false);
  const [isCheckingChanges, setIsCheckingChanges] = useState(false);
  const signatureRef = useRef<string>("");
  const lastChangeCheckAt = useRef<number>(0);

  const [visibleCount, setVisibleCount] = useState(pageSize);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const didRefreshAssetsOnOpen = useRef(false);

  // Mobile-only header auto-hide on scroll (desktop/tablet unchanged)
  const [hideHeader, setHideHeader] = useState(false);
  const lastScrollY = useRef(0);
  const proAnnotationRef = useRef<ProAnnotationCanvasHandle | null>(null);
  const spotCanvasRef = useRef<DrawingCanvasHandle | null>(null);
  const [spotUiTool, setSpotUiTool] = useState<"pen" | "eraser">("pen");
  const [spotUiBrush, setSpotUiBrush] = useState(60);
  const revisionCanvasRef = useRef<DrawingCanvasHandle | null>(null);
  const [revisionUiTool, setRevisionUiTool] = useState<"pen" | "eraser">("pen");
  const [revisionUiBrush, setRevisionUiBrush] = useState(60);
  const [socialEditor, setSocialEditor] = useState<SocialEditorState>(() => ({
    activeTab: "crop",
    crop: { x: 0, y: 0 },
    zoom: 1,
    aspect: undefined,
    activePreset: "original",
    croppedAreaPixels: null,
    adjustValues: {
      exposure: 100,
      luminance: 100,
      contrast: 100,
      saturation: 100,
      warmth: 0,
      hue: 0,
    },
    luminanceTargetHex: "#ffffff",
    activeAdjId: SOCIAL_ADJUSTMENTS[0]?.id || "exposure",
  }));

  // Image selection (images only)
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(() => new Set());
  const [allImages, setAllImages] = useState<any[] | null>(null);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [selectAllLoadedCount, setSelectAllLoadedCount] = useState(0);

  // Premium AI Suite state stored in gallery.metadata.aiSuite
  const [aiSuiteState, setAiSuiteState] = useState<any>(() => (gallery.metadata as any)?.aiSuite || { unlocked: false, remainingEdits: 0 });
  const aiSuiteUnlocked = !!aiSuiteState?.unlocked;
  const aiSuiteRemainingEdits = typeof aiSuiteState?.remainingEdits === "number" ? aiSuiteState.remainingEdits : 0;
  const aiSuiteRemainingVideos = typeof aiSuiteState?.remainingVideos === "number" ? aiSuiteState.remainingVideos : 0;
  // NOTE: This flag now represents whether PAID AI unlocks are enabled for the tenant.
  // Free trial packs can still be used even when this is false.
  const tenantAiSuiteEnabled = (() => {
    const raw = (tenant as any)?.settings?.aiSuite?.enabled;
    // Default OFF for safety, matching server-side enforcement.
    return typeof raw === "boolean" ? raw : false;
  })();
  const tenantFreeAiSuitePacksRemaining = (() => {
    const raw = (tenant as any)?.settings?.aiSuite?.freeUnlocksRemaining;
    if (typeof raw === "number") return raw;
    // Default to 1 if unset (matches server-side default), so tenants can trial without extra setup.
    // NOTE: unlock will still be blocked until Master enables AI for the tenant.
    return 1;
  })();
  const canUseFreeAiSuitePack =
    tenantFreeAiSuitePacksRemaining > 0 && (!aiSuiteUnlocked || aiSuiteRemainingEdits <= 0);

  const canUsePaidAiSuiteUnlock = tenantAiSuiteEnabled;

  const unlockFlowIsTrial = canUseFreeAiSuitePack;
  const unlockAllowed = unlockFlowIsTrial ? true : canUsePaidAiSuiteUnlock;

  const getAssetKey = (a: any) => String(a?.id || a?.url);
  const isImageAsset = (a: any) => (a?.type ? a.type === "image" : true);

  const openAiSocialVideo = () => {
    // Gate behind AI Suite unlock + separate quota
    if (!aiSuiteUnlocked || aiSuiteRemainingVideos <= 0) {
      setAiSuiteTermsAccepted(false);
      setPostUnlockAction("ai_social_video");
      setIsAiSuiteUnlockOpen(true);
      return;
    }
    setAiSocialVideoError(null);
    setIsAiSocialVideoOpen(true);
  };

  const openLockedAiTool = (action: "day_to_dusk" | "remove_furniture" | "replace_furniture" | "advanced_prompt") => {
    // Gate behind existing per-gallery AI Suite unlock/quota
    if (!aiSuiteUnlocked || aiSuiteRemainingEdits <= 0) {
      setAiSuiteTermsAccepted(false);
      setPostUnlockAction(
        action === "day_to_dusk"
          ? "ai_day_to_dusk"
          : action === "remove_furniture"
            ? "ai_remove_furniture"
            : action === "replace_furniture"
              ? "ai_replace_furniture"
              : "ai_advanced_prompt"
      );
      setIsAiSuiteUnlockOpen(true);
      return;
    }
    setAiRequestedAction(action);
    setAiRequestedNonce((n) => n + 1);
    setIsRequestingEdit(false);
    setActiveTool("ai");
    setIsAISuiteOpen(true);
  };

  const openLockedSpotRemoval = () => {
    // Gate behind existing per-gallery AI Suite unlock/quota
    if (!aiSuiteUnlocked || aiSuiteRemainingEdits <= 0) {
      setAiSuiteTermsAccepted(false);
      setPostUnlockAction("ai_spot_removal");
      setIsAiSuiteUnlockOpen(true);
      return;
    }
    setAiRequestedAction("spot_removal");
    setAiRequestedNonce((n) => n + 1);
    setIsRequestingEdit(false);
    setIsAISuiteOpen(false);
    setActiveTool("spot");
    setIsSpotRemovalOpen(true);
  };

  const TOOLBAR = useMemo(() => {
    return {
      unlocked: [
        { id: "revision", label: "Request Revision", description: "Send notes/markups to our editors (no AI unlock needed).", icon: PenTool, onClick: () => { 
          setIsAISuiteOpen(false);
          setIsSpotRemovalOpen(false);
          setIsDrawingMode(false);
          setActiveTool("request"); 
          setIsRequestingEdit(true); 
        } },
        { id: "social", label: "Social Editor", description: "Crop presets + export for web/social.", icon: Instagram, onClick: () => { 
          setIsRequestingEdit(false); 
          setIsAISuiteOpen(false); 
          setSocialInitialTab("crop"); 
          setSocialEditor((prev) => ({
            ...prev,
            activeTab: "crop",
            crop: { x: 0, y: 0 },
            zoom: 1,
            aspect: undefined,
            activePreset: "original",
            croppedAreaPixels: null,
          }));
          setActiveTool("social"); 
          setIsSocialCropperOpen(false); 
        } },
        { id: "color", label: "Colour", description: "Adjust exposure/contrast/saturation (on this image).", icon: Sliders, onClick: () => { 
          setIsRequestingEdit(false); 
          setIsAISuiteOpen(false); 
          setSocialInitialTab("adjust"); 
          setSocialEditor((prev) => ({
            ...prev,
            activeTab: "adjust",
          }));
          setActiveTool("color"); 
          setIsSocialCropperOpen(false); 
        } },
        { id: "pin", label: "Drop-pin", description: "Add pins/notes on the photo for your team.", icon: MapPin, onClick: () => { setIsRequestingEdit(false); setIsAISuiteOpen(false); setAnnotationInitialTool("pin"); setActiveTool("pin"); setIsAnnotationOpen(false); } },
        { id: "boundary", label: "Boundary", description: "Draw boundary lines/areas for guidance.", icon: Square, onClick: () => { setIsRequestingEdit(false); setIsAISuiteOpen(false); setAnnotationInitialTool("boundary"); setActiveTool("boundary"); setIsAnnotationOpen(false); } },
      ],
      locked: [
        { id: "day_to_dusk", label: "Day → Dusk", description: "Convert daylight to dusk lighting (AI).", icon: Moon, onClick: () => openLockedAiTool("day_to_dusk") },
        { id: "remove", label: "Remove Furniture", description: "Remove existing furniture (AI).", icon: Trash2, onClick: () => openLockedAiTool("remove_furniture") },
        { id: "spot", label: "Item removal", description: "Paint pink to remove objects (content-aware).", icon: Eraser, onClick: () => openLockedSpotRemoval() },
        { id: "replace", label: "Replace Furniture", description: "Replace furniture style (AI).", icon: Sofa, onClick: () => openLockedAiTool("replace_furniture") },
        { id: "advanced", label: "Advanced Prompt", description: "Custom AI prompt for this image.", icon: Wand2, onClick: () => openLockedAiTool("advanced_prompt") },
      ],
      comingSoon: [
        { id: "ai_video", label: "AI Social Video", description: "Generate a quick social video from selected images.", icon: Film },
      ],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSuiteUnlocked, aiSuiteRemainingEdits]);

  const startRevisionMarkup = () => {
    setActiveTool("request");
    setIsRequestingEdit(false);
    setIsDrawingMode(true);
    setRevisionUiTool("pen");
    setRevisionUiBrush(60);
    queueMicrotask(() => {
      revisionCanvasRef.current?.setTool("pen");
      revisionCanvasRef.current?.setBrushSize(60);
    });
  };

  const [isSpotRemovalOpen, setIsSpotRemovalOpen] = useState(false);
  const [isSpotRemovalProcessing, setIsSpotRemovalProcessing] = useState(false);
  const [spotRemovalError, setSpotRemovalError] = useState<string | null>(null);

  const toggleSelectImage = (item: any) => {
    const key = getAssetKey(item);
    setSelectedImageIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearSelection = () => setSelectedImageIds(new Set());

  const ensureAllImagesLoaded = async () => {
    if (allImages) return allImages;

    setIsSelectingAll(true);
    setSelectAllLoadedCount(0);

    const collected: any[] = [];
    const seen = new Set<string>();

    const pushAssets = (list: any[]) => {
      for (const a of list) {
        if (!isImageAsset(a)) continue;
        const key = getAssetKey(a);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        collected.push(a);
      }
      setSelectAllLoadedCount(collected.length);
    };

    try {
      // Include already-loaded assets first
      pushAssets(assets);

      // Then page through the rest
      let nextCursor: string | null = cursor ?? null;

      // If we have no cursor but we might not have all pages (initialCursor may be null),
      // fetch from the start to ensure completeness.
      if (!nextCursor) {
        const first = await getGalleryAssets(gallery.id, 24);
        if (first.success) {
          pushAssets(first.assets || []);
          nextCursor = first.nextCursor || null;
        }
      }

      while (nextCursor) {
        const res = await getGalleryAssets(gallery.id, 24, nextCursor);
        if (!res.success) break;
        pushAssets(res.assets || []);
        nextCursor = res.nextCursor || null;
      }

      setAllImages(collected);
      return collected;
    } finally {
      setIsSelectingAll(false);
    }
  };

  const handleSelectAllImages = async () => {
    const imgs = await ensureAllImagesLoaded();
    const next = new Set<string>();
    imgs.forEach((a) => next.add(getAssetKey(a)));
    setSelectedImageIds(next);
  };

  const selectedCount = selectedImageIds.size;

  const GalleryActionButtons = () => (
    <div className="flex items-center gap-2 md:flex-nowrap flex-wrap justify-center">
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
          className="hidden md:flex h-9 px-4 rounded-full bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 hover:scale-105 active:scale-95 transition-all items-center gap-2"
        >
          <Heart className="h-3 w-3 fill-current" />
          Share Selection ({favorites.length})
        </button>
      )}

      {canDownload && (
        <>
          {/* Selection controls (images only, not on shared link view) */}
          {!isShared && (
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={handleSelectAllImages}
                disabled={isSelectingAll}
                className={cn(
                  "h-9 px-3.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                  isSelectingAll
                    ? "bg-slate-50 text-slate-400 border-slate-200 cursor-wait"
                    : "bg-white text-slate-700 border-slate-200 hover:border-[#b5d0c1] hover:text-slate-900"
                )}
                title="Select all images"
              >
                <BoxSelect className="h-3 w-3" />
                {isSelectingAll ? `Selecting… ${selectAllLoadedCount}` : "Select All"}
              </button>

              {selectedCount > 0 && (
                <button
                  onClick={clearSelection}
                  className="h-9 px-3.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all"
                  title="Clear selection"
                >
                  Selected: {selectedCount} · Clear
                </button>
              )}
            </div>
          )}

          {/* Download Favourites (V2: shown only when Favourites tab is active) */}
          {!isShared && activeFilter === "favorites" && favorites.length > 0 && (
            <button
              onClick={async () => {
                // Ensure we have the full set of images so favourites can be downloaded even if not paged in yet
                const imgs = await ensureAllImagesLoaded();
                const favs = imgs.filter((a: any) => favorites.includes(String(a?.id || a?.url || "")));
                if (favs.length === 0) return;
                setDownloadAssets(favs);
                setIsDownloadManagerOpen(true);
              }}
              disabled={isSelectingAll}
              className={cn(
                "hidden md:flex h-9 px-4 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg transition-all items-center gap-2",
                isSelectingAll
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  : "bg-white text-slate-900 border border-slate-200 hover:scale-105 active:scale-95"
              )}
              title="Download favourites"
            >
              <Download className="h-3 w-3" />
              Download Favourites
            </button>
          )}

          {/* Download Selected */}
          {!isShared && (
            <button
              onClick={async () => {
                if (selectedCount === 0) return;
                // Prefer currently-loaded items; only fetch-all if we don't have the selected set locally.
                const localImages = allImages || assets.filter((a) => isImageAsset(a));
                const localMap = new Map<string, any>();
                localImages.forEach((a) => localMap.set(getAssetKey(a), a));

                const hasAllSelectedLocally = Array.from(selectedImageIds).every((id) => localMap.has(id));
                const sourceImages = hasAllSelectedLocally ? localImages : await ensureAllImagesLoaded();

                const byId = new Map<string, any>();
                sourceImages.forEach((a) => byId.set(getAssetKey(a), a));
                const selected = Array.from(selectedImageIds)
                  .map((id) => byId.get(id))
                  .filter(Boolean);

                setDownloadAssets(selected);
                setIsDownloadManagerOpen(true);
              }}
              disabled={selectedCount === 0 || isSelectingAll}
              className={cn(
                "hidden md:flex h-9 px-4 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg transition-all items-center gap-2",
                selectedCount === 0 || isSelectingAll
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  : "bg-white text-slate-900 border border-slate-200 hover:scale-105 active:scale-95"
              )}
              title="Download selected images"
            >
              <Download className="h-3 w-3" />
              Download Selected
            </button>
          )}

          {/* Download All */}
          <button 
            onClick={() => {
              setDownloadAssets(assets);
              setIsDownloadManagerOpen(true);
            }}
            className="h-9 px-4 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-slate-900/10 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
          >
            <Download className="h-3 w-3" />
            Download All
          </button>
        </>
      )}

      {!!user && !isShared && (
        <button 
          onClick={() => setIsShareModalOpen(true)}
          className="hidden md:flex h-9 w-9 rounded-full bg-white border border-slate-200 text-slate-400 items-center justify-center hover:text-slate-900 transition-colors shadow-sm"
        >
          <Share2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  // 1. Fetch user session client-side after hydration to avoid blocking SSR
  useEffect(() => {
    if (!initialUser) {
      fetch("/api/auth/session")
        .then(res => res.json())
        .then(data => {
          if (data?.user) {
            setUser({
              role: data.user.role,
              clientId: data.user.clientId,
              permissions: data.user.permissions || {}
            });
          }
        })
        .catch(err => console.error("Session fetch error:", err));
    }
  }, [initialUser]);

  // Mobile-only: hide header on scroll down, show on scroll up
  useEffect(() => {
    const onScroll = () => {
      // Only apply on phone widths; keep web/tablet perfect.
      if (window.innerWidth >= 640) return;

      const y = window.scrollY || 0;
      if (y < 80) {
        setHideHeader(false);
        lastScrollY.current = y;
        return;
      }

      if (y > lastScrollY.current + 10) setHideHeader(true);
      else if (y < lastScrollY.current - 10) setHideHeader(false);

      lastScrollY.current = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Load more assets via pagination
  const loadMoreAssets = async () => {
    if (isLoadingMore || !cursor) return;

    setIsLoadingMore(true);
    try {
      const result = await getGalleryAssets(gallery.id, pageSize, cursor);
      if (result.success) {
        setAssets(prev => {
          const newAssets = result.assets || [];
          // Avoid duplicates
          const existingIds = new Set(prev.map(a => a.id));
          const filteredNew = newAssets.filter(a => !existingIds.has(a.id));
          return [...prev, ...filteredNew];
        });
        setCursor(result.nextCursor || null);
      }
    } catch (err) {
      console.error("Load more error:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const computeSignature = React.useCallback(
    (list: any[]) =>
      (list || [])
        .slice(0, pageSize)
        .map((a) => String(a?.id || a?.name || a?.path || a?.url || ""))
        .join("|"),
    [pageSize],
  );

  // V2: keep a stable signature for the first page and check for changes on focus (no auto-reshuffle).
  useEffect(() => {
    if (!progressiveBanner) return;
    // Only update signature when we are not currently prompting a refresh.
    if (!showRefreshToast) signatureRef.current = computeSignature(assets);
  }, [assets, progressiveBanner, computeSignature, showRefreshToast]);

  const checkForChanges = React.useCallback(async () => {
    if (!progressiveBanner) return;
    const now = Date.now();
    if (now - lastChangeCheckAt.current < 5000) return; // simple throttle
    lastChangeCheckAt.current = now;

    setIsCheckingChanges(true);
    try {
      const res = await fetch(`/api/gallery/${gallery.id}/changes?limit=${pageSize}`, { cache: "no-store" });
      const data = await res.json();
      if (!data?.success) return;
      const nextSig = String(data.signature || "");
      if (nextSig && signatureRef.current && nextSig !== signatureRef.current) {
        setShowRefreshToast(true);
      }
    } catch {
      // non-blocking
    } finally {
      setIsCheckingChanges(false);
    }
  }, [gallery.id, pageSize, progressiveBanner]);

  useEffect(() => {
    if (!progressiveBanner) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        checkForChanges();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [checkForChanges, progressiveBanner]);

  // Helper to append shared flag and size for incognito access to locked galleries
  const getImageUrl = (url: string, size: string = "w1024h768") => {
    if (!url) return "";
    
    // SSR Safety Check: origin is only available on client
    const isClient = typeof window !== 'undefined';
    const origin = isClient ? window.location.origin : '';
    
    // If it's already a proxy URL (/api/...) just append parameters
    if (url.startsWith("/api/")) {
      try {
        const urlObj = new URL(url, isClient ? origin : "http://localhost");
        if (isShared) urlObj.searchParams.set("shared", "true");
        // Always ensure we have a size if provided
        if (size && !urlObj.searchParams.has("size")) urlObj.searchParams.set("size", size);
        return urlObj.pathname + urlObj.search;
      } catch (e) {
        return url;
      }
    }

    // DROPBOX
    if (url.includes("dropbox.com") || url.includes("dropboxusercontent.com")) {
      // Normalize to www.dropbox.com and remove query params for the base shared link
      const cleanUrl = cleanDropboxLink(url);
      // Use path=/ for direct file shared links (Dropbox API requirement)
      let proxyUrl = `/api/dropbox/assets/${gallery.id}?path=/&sharedLink=${encodeURIComponent(cleanUrl)}&size=${size}`;
      if (isShared) proxyUrl += "&shared=true";
      return proxyUrl;
    }

    // GOOGLE DRIVE
    if (url.includes("drive.google.com") || url.includes("googleusercontent.com")) {
      const gDriveMatch = url.match(/\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
      const gDriveId = gDriveMatch?.[1];
      if (gDriveId) {
        let proxyUrl = `/api/google-drive/assets/${gallery.id}?id=${gDriveId}&size=${size}`;
        if (isShared) proxyUrl += "&shared=true";
        return proxyUrl;
      }
    }

    // Standard internal path handling
    try {
      const urlObj = new URL(url, isClient ? origin : "http://localhost");
      if (isShared) urlObj.searchParams.set("shared", "true");
      if (size) urlObj.searchParams.set("size", size);
      return urlObj.pathname + urlObj.search;
    } catch (e) {
      return url;
    }
  };

  // --- Unified workspace: non-destructive versions (per selected asset) ---
  const ensureOriginalVersion = useCallback(
    (asset: any) => {
      const key = getAssetKey(asset);
      if (!key) return;
      setVersionsByAssetId((prev) => {
        if (prev[key]?.length) return prev;
        const original: ImageVersion = {
          id: "original",
          label: "Original",
          tool: "none",
          kind: "url",
          src: getImageUrl(asset.url, "w2048h1536"),
          createdAt: Date.now(),
        };
        return { ...prev, [key]: [original] };
      });
      setActiveVersionIdByAssetId((prev) => (prev[key] ? prev : { ...prev, [key]: "original" }));
    },
    [getImageUrl]
  );

  const addVersion = useCallback(
    (asset: any, v: Omit<ImageVersion, "createdAt">) => {
      const key = getAssetKey(asset);
      if (!key) return;
      if (v.kind === "blob" && typeof v.src === "string" && v.src.startsWith("blob:")) {
        blobUrlRegistryRef.current.add(v.src);
      }
      setVersionsByAssetId((prev) => {
        const existing = prev[key] || [];
        const next = [...existing, { ...v, createdAt: Date.now() }];
        return { ...prev, [key]: next };
      });
      setActiveVersionIdByAssetId((prev) => ({ ...prev, [key]: v.id }));
    },
    []
  );

  const activeAssetKey = selectedAsset ? getAssetKey(selectedAsset) : "";
  const versionsForSelected = activeAssetKey ? versionsByAssetId[activeAssetKey] || [] : [];
  const activeVersionId = activeAssetKey ? activeVersionIdByAssetId[activeAssetKey] || "original" : "original";
  const activeVersion = versionsForSelected.find((v) => v.id === activeVersionId) || versionsForSelected[0];
  const activeImageSrc = activeVersion?.src || (selectedAsset ? getImageUrl(selectedAsset.url, "w2048h1536") : "");

  useEffect(() => {
    if (selectedAsset) ensureOriginalVersion(selectedAsset);
  }, [selectedAsset, ensureOriginalVersion]);

  // Cleanup blob object URLs on unmount (best-effort)
  useEffect(() => {
    return () => {
      for (const url of blobUrlRegistryRef.current) {
        try { URL.revokeObjectURL(url); } catch {}
      }
      blobUrlRegistryRef.current.clear();
    };
  }, []);

  // Public unauthenticated viewers should be view-only (favorites allowed, no downloads/edits/tools)
  const isPublicUnauthed = !user;
  const canDownload = !!user && permissionService.can(user, "canDownloadHighRes");
  const canEdit = !!user && permissionService.can(user, "canEditRequests");

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
    if (isRightSwipe && !selectedAsset && !selectedVideo) {
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

  // Load real assets if not provided (fallback)
  useEffect(() => {
    if (assets.length === 0 && !cursor) {
      async function loadInitial() {
        setIsLoading(true);
        try {
          const result = await getGalleryAssets(gallery.id, pageSize);
          if (result.success) {
            setAssets(result.assets || []);
            setCursor(result.nextCursor || null);
          }
        } catch (err) {
          console.error("Initial load error:", err);
        } finally {
          setIsLoading(false);
        }
      }
      loadInitial();
    }
  }, [gallery.id, assets.length, cursor]);

  // Refresh assets on open to detect newly-added photos in Dropbox/Drive after gallery creation.
  // This does a FULL refresh (pages through all items) so the gallery matches the source folder.
  useEffect(() => {
    if (!refreshAssetsOnOpen) return;
    if (didRefreshAssetsOnOpen.current) return;
    didRefreshAssetsOnOpen.current = true;

    (async () => {
      setIsLoading(true);
      try {
        const keyOf = (a: any) => String(a?.id || a?.url || "");
        const pageSize = 1000;
        const expectedCount = Number((gallery.metadata as any)?.imageCount || 0);

        const collected: any[] = [];
        const seen = new Set<string>();
        const push = (list: any[]) => {
          for (const a of list || []) {
            if (!isImageAsset(a)) continue;
            const k = keyOf(a);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            collected.push(a);
          }
        };

        const first = await getGalleryAssets(gallery.id, pageSize);
        if (!first?.success) return;
        push(first.assets || []);

        let nextCursor: string | null = first.nextCursor || null;
        let guard = 0;
        while (
          nextCursor &&
          guard < 60 && // safety guard
          (expectedCount <= 0 || collected.length < expectedCount)
        ) {
          guard++;
          const next = await getGalleryAssets(gallery.id, pageSize, nextCursor);
          if (!next?.success) break;
          push(next.assets || []);
          nextCursor = next.nextCursor || null;
        }

        // Replace assets entirely so the view matches Dropbox (not "old + some new")
        setAssets(collected);
        setCursor(nextCursor); // usually null after full load
        setAllImages(null); // force re-enumeration for Select All / Download Selected
      } catch (e) {
        console.error("Refresh assets on open failed:", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [gallery.id]);

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
    if (selectedTagIds.length === 0 && !editNote && videoTimestamp === null && videoComments.length === 0 && !annotationData && !drawingData) {
      alert("Please select at least one tag, add a note, or create markups.");
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
            annotationData: annotationData, // NEW: Include professional markup data
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
        setIsAnnotationOpen(false);
        setIsVideoEditing(false);
        setEditSuccess(false);
        setEditNote("");
        setSelectedTagIds([]);
        setDrawingData(null);
        setAnnotationData(null); // Clear annotation data
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

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          // 1. If we have more in memory than visible, show more
          if (combinedMedia.length > visibleCount) {
            setVisibleCount((prev) => Math.min(prev + revealStep, combinedMedia.length));
          } 
          // 2. If we've shown everything in memory and have a cursor, fetch from server
          else if (cursor && !isLoadingMore) {
            loadMoreAssets();
          }
        }
      },
      { threshold: 0.1, rootMargin: "400px" }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [combinedMedia.length, visibleCount, cursor, isLoadingMore]);

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
      <header
        className={cn(
          "sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 px-6 py-4 transition-transform duration-300",
          hideHeader ? "-translate-y-full sm:translate-y-0" : "translate-y-0"
        )}
      >
        <div className="max-w-[103rem] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                const role = user?.role;
                const isAdminLike = role === "TENANT_ADMIN" || role === "ADMIN" || role === "AGENT";
                if (isAdminLike) router.push("/");
                else router.back();
              }}
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

          {/* Actions moved to bottom-of-hero subheader (per design reference) */}
        </div>
      </header>

      {/* Hero Section: Banner First */}
      {(() => {
        const bannerUrl = gallery.bannerImageUrl;
        const isFolder = bannerUrl?.includes("/drive/folders/") || bannerUrl?.includes("/drive/u/");
        
        if (bannerUrl && !isFolder) {
          const lowSrc = getImageUrl(bannerUrl, "w640h480");
          const highSrc = getImageUrl(bannerUrl, "w2560h1440");
          const fallbackSrc = formatDropboxUrl(bannerUrl);
          return (
            <section className="px-6 pt-6">
              <div className="max-w-[103rem] mx-auto relative h-[60vh] w-full overflow-hidden rounded-[48px] shadow-2xl shadow-slate-200 bg-slate-100">
                {/* Progressive banner (V2) */}
                {progressiveBanner ? (
                  <>
                <Image 
                      src={bannerFailed ? fallbackSrc : lowSrc}
                  alt={gallery.title}
                  fill
                  priority
                  className="object-cover"
                  sizes="(max-width: 1280px) 100vw, 1280px"
                  onError={() => setBannerFailed(true)}
                />
                    {/* High-res layer crossfades in after it loads */}
                    {!bannerFailed && (
                      <HighResBannerLayer
                        src={highSrc}
                        alt={gallery.title}
                        onError={() => setBannerFailed(true)}
                      />
                    )}
                  </>
                ) : (
                  <Image
                    src={bannerFailed ? fallbackSrc : getImageUrl(bannerUrl, "w1024h768")}
                    alt={gallery.title}
                    fill
                    priority
                    className="object-cover"
                    sizes="(max-width: 1280px) 100vw, 1280px"
                    onError={() => setBannerFailed(true)}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10" />
                <div className="absolute bottom-12 left-12 text-white space-y-1 z-20">
                  <h2 className="text-4xl font-bold tracking-tight">{gallery.title}</h2>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/80">By {gallery.teamMembers}</p>
                </div>
              </div>
            </section>
          );
        }

        if (videos.length > 0) {
          return (
            <section className="px-6 pt-6">
              <div className="max-w-[103rem] mx-auto bg-black relative aspect-video w-full max-h-[70vh] overflow-hidden rounded-[48px] shadow-2xl group">
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
          );
        }

        // Fallback to first image if no banner/video
        if (assets.length > 0) {
          return (
            <section className="px-6 pt-6">
              <div className="max-w-[103rem] mx-auto relative h-[40vh] w-full overflow-hidden rounded-[48px] shadow-2xl shadow-slate-200">
                <img 
                  src={getImageUrl(assets[0].url, "w1024h768")} 
                  alt={gallery.title}
                  className="h-full w-full object-cover blur-sm opacity-50 scale-110"
                />
                <div className="absolute inset-0 bg-slate-900/40" />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12">
                  <h2 className="text-5xl font-black text-white tracking-tighter uppercase">{gallery.title}</h2>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mt-4">Production Collection</p>
                </div>
              </div>
            </section>
          );
        }

        return null;
      })()}

      {/* Main Content */}
      <main className="flex-1 bg-white">
        <div className="max-w-[103rem] mx-auto px-6 py-12">
          {/* V2: initial preparing overlay (only if we don't have initial assets yet) */}
          {progressiveBanner && isLoading && assets.length === 0 && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-white/80 backdrop-blur-md">
              <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 p-10 w-full max-w-md text-center">
                <CameraLoader size="lg" className="text-primary mx-auto mb-6" />
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Preparing your gallery</h3>
                <p className="text-sm font-medium text-slate-400 mt-2">
                  We’re syncing your production assets now. This usually takes a moment.
                </p>
              </div>
            </div>
          )}

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
              
              <div className="flex flex-col items-center md:items-end gap-3">
                <GalleryActionButtons />
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
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="aspect-[3/2] rounded-[32px] bg-slate-50 animate-pulse border border-slate-100 flex items-center justify-center">
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
            <>
              {/* True masonry packing (reference-style): CSS columns stack independently and avoid grid holes. */}
              <div className="columns-2 sm:columns-2 md:columns-3 lg:columns-4 gap-3 sm:gap-4 lg:gap-5">
                {combinedMedia.slice(0, visibleCount).map((item: any, idx: number) => (
                  (() => {
                    const isSelectableImage = canDownload && !isShared && item.type === "image";
                    const isSelected = isSelectableImage && selectedImageIds.has(getAssetKey(item));
                    return (
                  <div 
                    key={item.id || idx} 
                    className={cn(
                      // Square edges to match reference masonry look
                      "break-inside-avoid relative overflow-hidden bg-slate-50 cursor-zoom-in border border-slate-100 group transition-all duration-500 hover:shadow-2xl hover:shadow-slate-200 mb-3 sm:mb-4 lg:mb-5",
                      isSelected && "border-transparent"
                    )}
                    onClick={() => {
                      if (item.type === "video") {
                        setSelectedVideo(item);
                      } else {
                        setIsAssetLoading(true);
                        setSelectedAsset(item);
                      }
                    }}
                  >
                    {/* Select toggle (images only) - top-left, replaces the old tag pill */}
                    {isSelectableImage && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectImage(item);
                        }}
                        className={cn(
                          "absolute top-5 left-5 z-40 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all border opacity-0 group-hover:opacity-100",
                          isSelected
                            ? "bg-[#b5d0c1]/95 border-white/60 text-slate-900 shadow-lg"
                            : "bg-white/30 backdrop-blur-md border-white/30 text-white hover:bg-white/40"
                        )}
                        title="Select image"
                        aria-label="Select image"
                      >
                        {isSelected ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <BoxSelect className="h-3.5 w-3.5" />
                        )}
                        Select image
                      </button>
                    )}

                    {/* Selected outline (thicker + Safari-safe rounded corners) */}
                    {isSelected && (
                      <div
                        className="pointer-events-none absolute inset-0 z-20 border-[6px] border-[#b5d0c1]"
                      />
                    )}

                    {item.type === "video" ? (
                      <div 
                        className="h-full w-full bg-slate-950 flex items-center justify-center relative group/vid aspect-video rounded-[32px] overflow-hidden"
                      >
                        {/* Video Thumbnail: Use Banner Image if available, otherwise a placeholder */}
                        <div className="absolute inset-0 z-0 flex items-center justify-center">
                          {gallery.bannerImageUrl ? (
                            <img 
                              src={getImageUrl(gallery.bannerImageUrl, "w1024h768")} 
                              alt="Video Thumbnail"
                              className="w-full h-full object-cover grayscale contrast-125 opacity-40 group-hover/vid:scale-105 transition-all duration-1000"
                            />
                          ) : (
                            <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center gap-4">
                              <div className="h-20 w-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/20">
                                <VideoIcon className="h-8 w-8" />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* High-end Play Button Overlay */}
                        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                          {/* Signature Green Play Button */}
                          <div className="h-16 w-16 rounded-full bg-emerald-500 flex items-center justify-center text-white group-hover/vid:scale-110 transition-all duration-500 shadow-xl shadow-emerald-500/20">
                            <Play className="h-6 w-6 fill-current ml-1" />
                          </div>
                        </div>
                        
                        {/* Gradient Overlay for labels */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 pointer-events-none" />
                      </div>
                    ) : (
                      <ProgressiveImage 
                        src={item.url} 
                        alt={item.name}
                        className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105"
                        getImageUrl={getImageUrl}
                        priority={idx < 6}
                        directUrl={item.directUrl}
                      />
                    )}
                    
                    <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-all duration-300 pointer-events-none" />
                    
                    {/* Removed: old top-left tag pill (e.g. “PRODUCTION LINK”) per new selection UI */}

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
                      item.type === "video" ? "group-hover/vid:opacity-100" : ""
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
                            {!!user && item.type === "image" && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAsset(item);
                                }}
                                className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center hover:bg-white hover:text-slate-900 transition-all"
                                title="Open Editor"
                              >
                                <Pencil className="h-4 w-4" />
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
                    );
                  })()
                ))}
              </div>
              
              {/* Load More Trigger (show when we either have more to reveal OR more to fetch) */}
              {(combinedMedia.length > visibleCount || !!cursor || isLoadingMore) && (
                <div ref={loadMoreRef} className="min-h-20 py-8 flex items-center justify-center">
                  {isLoadingMore && progressiveBanner ? (
                    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 w-full">
                      {Array.from({ length: revealStep }).map((_, i) => (
                        <div
                          key={i}
                          className="aspect-[3/2] rounded-[24px] bg-slate-50 animate-pulse border border-slate-100"
                        />
                      ))}
                    </div>
                  ) : (
                  <Loader2 className="h-6 w-6 animate-spin text-slate-200" />
                  )}
                </div>
              )}
            </>
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
              <p className="text-sm font-bold text-slate-400">
                {process.env.NODE_ENV !== "production" && initialAssetsError
                  ? initialAssetsError
                  : "Your production assets haven't finished syncing yet."}
              </p>
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-2">Check back in a few moments</p>
            </div>
          )}
        </div>
      </main>

      {/* V2: Refresh Available Toast (on open + tab focus checks) */}
      {progressiveBanner && showRefreshToast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[160] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-900/95 backdrop-blur-xl text-white px-5 py-4 rounded-[22px] shadow-2xl flex items-center gap-4 border border-white/10">
            <div className="space-y-0.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Gallery updated</p>
              <p className="text-sm font-bold tracking-tight">New or removed photos detected.</p>
            </div>
            <button
              onClick={async () => {
                setShowRefreshToast(false);
                setIsLoading(true);
                try {
                  const result = await getGalleryAssets(gallery.id, pageSize);
                  if (result?.success) {
                    setAssets(result.assets || []);
                    setCursor(result.nextCursor || null);
                    setVisibleCount(pageSize);
                    signatureRef.current = computeSignature(result.assets || []);
                  }
                } finally {
                  setIsLoading(false);
                }
              }}
              className="h-10 px-4 rounded-full bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={() => setShowRefreshToast(false)}
              className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Lightbox / Asset Viewer */}
      {selectedAsset && (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-in fade-in duration-300">
          <div className="flex items-center justify-between p-6 shrink-0 relative z-10">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => {
                  setSelectedAsset(null);
                  setIsAssetLoading(false);
                  setActiveTool("none");
                  setIsAISuiteOpen(false);
                  setIsRequestingEdit(false);
                }}
                className="h-10 w-10 rounded-full bg-white/5 text-white flex items-center justify-center hover:bg-white/10 transition-all border border-white/5"
              >
                <X className="h-5 w-5" />
              </button>
              <div>
                <div className="flex items-center gap-3">
                  <p className="text-xs font-bold text-white tracking-tight">{selectedAsset.name}</p>
                  {canEdit && !isShared && requestedFileUrls.includes(selectedAsset.url) && (
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

            <div className="flex items-center gap-3" />
          </div>

            <div className="flex-1 relative flex gap-5 p-4 md:p-8 overflow-hidden">
              {/* Image area */}
              <div className="flex-1 relative flex items-center justify-center min-w-0">
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
              
              <div
                className={cn(
                  "relative inline-block align-middle group/main transition-all duration-500 ease-in-out",
                  // Space is now handled by the right rail; avoid huge layout jumps.
                  "lg:mr-0"
                )}
              >
                <img 
                  ref={imgRef}
                  src={activeImageSrc || getImageUrl(selectedAsset.url, "w1024h768")} 
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

                {/* Photoshop-style: Pin/Boundary edits happen on the MAIN image (no second preview panel). */}
                {(activeTool === "pin" || activeTool === "boundary") && selectedAsset && (
                  <ProAnnotationCanvas
                    // Dynamic component types don't carry refs well; cast is safe for our imperative handle.
                    ref={proAnnotationRef as any}
                    mode="embedded"
                    enabledTools={["select", "pin", "boundary"]}
                    imageUrl={activeImageSrc}
                    exportImageUrl={
                      selectedAsset?.path
                        ? `/api/dropbox/download/${gallery.id}?path=${encodeURIComponent(selectedAsset.path)}&sharedLink=${encodeURIComponent(String(gallery.metadata?.dropboxLink || ""))}&applyBranding=false`
                        : activeImageSrc
                    }
                    logoUrl={
                      (() => {
                        const raw = (gallery.clientBranding?.url || tenant.logoUrl || "").toString();
                        if (!raw) return undefined;
                        if (raw.includes("dropbox.com") || raw.includes("dropboxusercontent.com")) {
                          return `/api/logo-proxy?url=${encodeURIComponent(raw)}`;
                        }
                        return raw;
                      })()
                    }
                    initialTool={annotationInitialTool}
                    onSave={(data, blob) => {
                      setAnnotationData(data);

                      if (blob) {
                        const persistUrl = URL.createObjectURL(blob);
                        const downloadUrl = URL.createObjectURL(blob);
                        addVersion(selectedAsset, {
                          id: `markup-${Date.now()}`,
                          label: activeTool === "boundary" ? "Boundary" : "Pin Drop",
                          tool: activeTool,
                          kind: "blob",
                          src: persistUrl,
                          blob,
                        });

                        const markedUpAsset = {
                          ...selectedAsset,
                          id: `markup-${selectedAsset.id}`,
                          name: `MarkedUp-${selectedAsset.name}`,
                          isMarkup: true,
                          markupBlob: blob,
                          originalName: selectedAsset.name,
                          originalPath: selectedAsset.path,
                          url: downloadUrl,
                        };
                        setDownloadAssets([markedUpAsset]);
                        setIsDownloadManagerOpen(true);
                        setActiveTool("none");
                      } else {
                        setIsRequestingEdit(true);
                        setActiveTool("request");
                      }
                    }}
                    onCancel={() => setActiveTool("none")}
                  />
                )}

                {/* Photoshop-style: Social/Colour edits happen on the MAIN image (no second preview panel). */}
                {(activeTool === "social" || activeTool === "color") && selectedAsset && (
                  <SocialCropper
                    mode="embedded"
                    variant={activeTool === "color" ? "adjust" : "crop"}
                    imageUrl={activeImageSrc}
                    imageName={selectedAsset.name}
                    onClose={() => setActiveTool("none")}
                    state={socialEditor}
                    onStateChange={(patch) => {
                      setSocialEditor((prev) => ({
                        ...prev,
                        ...patch,
                        adjustValues: patch.adjustValues ? { ...prev.adjustValues, ...patch.adjustValues } : prev.adjustValues,
                      }));
                    }}
                  />
                )}

                {/* Photoshop-style: Item Removal paints directly on the MAIN image (no separate view). */}
                {isSpotRemovalOpen && activeTool === "spot" && selectedAsset && (
                  <DrawingCanvas
                    ref={spotCanvasRef as any}
                    mode="embedded"
                    imageUrl={activeVersion?.kind === "blob" ? getImageUrl(selectedAsset.url, "w2048h1536") : activeImageSrc}
                    isMaskMode
                    maskPurpose="remove"
                    onSave={async (_data, maskUrl) => {
                      if (!maskUrl) {
                        setSpotRemovalError("Please paint over the item(s) you want removed.");
                        return;
                      }
                      setSpotRemovalError(null);
                      setIsSpotRemovalOpen(false);
                      setIsSpotRemovalProcessing(true);
                      try {
                        const res = await runAiSuiteSpotRemoval({
                          galleryId: gallery.id,
                          assetUrl: activeVersion?.kind === "blob" ? getImageUrl(selectedAsset.url, "w2048h1536") : activeImageSrc,
                          dbxPath: selectedAsset.path,
                          maskDataUrl: maskUrl,
                        });
                        if (res?.success && res.outputUrl) {
                          if (res.aiSuite) setAiSuiteState((prev: any) => ({ ...(prev || {}), ...(res.aiSuite || {}) }));
                          addVersion(selectedAsset, {
                            id: `spot-${Date.now()}`,
                            label: "Item Removal",
                            tool: "spot",
                            kind: "url",
                            src: String(res.outputUrl),
                          });
                          setActiveTool("none");
                        } else {
                          if ((res as any)?.error === "AI_DISABLED") {
                            setSpotRemovalError("AI Suite is disabled for this studio.");
                          } else if ((res as any)?.error === "AI_SUITE_LOCKED" || (res as any)?.error === "AI_SUITE_LIMIT") {
                            setAiSuiteTermsAccepted(false);
                            setPostUnlockAction("ai_spot_removal");
                            setIsAiSuiteUnlockOpen(true);
                          }
                          setSpotRemovalError((res as any)?.error || "AI removal failed. Please try again.");
                        }
                      } finally {
                        setIsSpotRemovalProcessing(false);
                      }
                    }}
                    onCancel={() => {
                      setIsSpotRemovalOpen(false);
                      setSpotRemovalError(null);
                      setActiveTool("none");
                    }}
                  />
                )}

                {/* Photoshop-style: Request Revision markups draw directly on the MAIN image (no popup drawing screen). */}
                {isDrawingMode && activeTool === "request" && selectedAsset && (
                  <DrawingCanvas
                    ref={revisionCanvasRef as any}
                    mode="embedded"
                    imageUrl={activeVersion?.kind === "blob" ? getImageUrl(selectedAsset.url, "w2048h1536") : activeImageSrc}
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
                
                {activeTool === "none" && (
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 opacity-0 group-hover/main:opacity-100 transition-opacity text-center">
                    <p className="text-[9px] font-black text-white/80 uppercase tracking-widest flex items-center gap-2">
                      <Monitor className="h-3 w-3" />
                      High Definition Preview (1024px)
                    </p>
                    <p className="text-[7px] font-bold text-white/40 uppercase mt-0.5 tracking-tight">Full resolution available via download</p>
                  </div>
                )}
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

              {/* Right rail: Tools + Results */}
              <aside className="w-[220px] sm:w-[260px] lg:w-[320px] shrink-0">
                <div className="h-full max-h-[calc(100vh-140px)] overflow-y-auto no-scrollbar rounded-3xl bg-white/5 border border-white/10 p-4 backdrop-blur-md">
                  {/* Top actions */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {!!user && !isShared && (
                        <button
                          type="button"
                          onClick={(e) => handleToggleFavorite(e as any, selectedAsset)}
                          className={cn(
                            "h-10 w-10 rounded-2xl flex items-center justify-center transition-all border shadow-lg",
                            favorites.includes(selectedAsset.id || selectedAsset.url)
                              ? "bg-rose-500 border-rose-400 text-white"
                              : "bg-white/5 border-white/10 text-white hover:bg-white hover:text-rose-500"
                          )}
                          title="Favourite"
                        >
                          <Heart
                            className={cn(
                              "h-4 w-4",
                              favorites.includes(selectedAsset.id || selectedAsset.url) && "fill-current"
                            )}
                          />
                        </button>
                      )}

                      {gallery.isCopyPublished && gallery.aiCopy && (
                        <button
                          type="button"
                          onClick={() => setIsCopyModalOpen(true)}
                          className="h-10 px-4 rounded-2xl bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-[1.02] transition-all shadow-lg border border-slate-200"
                          title="Property Copy"
                        >
                          <FileText className="h-3.5 w-3.5 text-primary" />
                          Copy
                        </button>
                      )}
                    </div>

                    {canDownload && (
                      <button
                        type="button"
                        onClick={() => {
                          if (activeVersion && activeVersion.id !== "original") {
                            if (activeVersion.kind === "blob" && activeVersion.blob) {
                              const downloadUrl = URL.createObjectURL(activeVersion.blob);
                              const vAsset = {
                                ...selectedAsset,
                                id: `version-${selectedAsset.id}-${activeVersion.id}`,
                                name: `${activeVersion.label}-${selectedAsset.name}`,
                                isMarkup: true,
                                markupBlob: activeVersion.blob,
                                originalPath: selectedAsset.path,
                                originalName: selectedAsset.name,
                                url: downloadUrl,
                              };
                              setDownloadAssets([vAsset]);
                            } else {
                              const vAsset = {
                                ...selectedAsset,
                                id: `version-${selectedAsset.id}-${activeVersion.id}`,
                                name: `${activeVersion.label}-${selectedAsset.name}`,
                                url: activeVersion.src,
                                originalPath: selectedAsset.path,
                                originalName: selectedAsset.name,
                                isAiResult: activeVersion.tool === "ai",
                              };
                              setDownloadAssets([vAsset]);
                            }
                          } else {
                            setDownloadAssets([selectedAsset]);
                          }
                          setIsDownloadManagerOpen(true);
                        }}
                        className="h-10 px-4 rounded-2xl bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-[1.02] transition-all shadow-lg"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>
                    )}
                  </div>

                  {/* Results */}
                  <div className="mt-5">
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">Results</p>
                    <div className="space-y-2">
                      {versionsForSelected.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!activeAssetKey) return;
                            setActiveVersionIdByAssetId((prev) => ({ ...prev, [activeAssetKey]: v.id }));
                          }}
                          className={cn(
                            "w-full h-10 px-4 rounded-2xl text-left text-[10px] font-black uppercase tracking-widest transition-all border flex items-center justify-between",
                            v.id === activeVersionId
                              ? "bg-white text-slate-900 border-white shadow-lg"
                              : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
                          )}
                          title={v.label}
                        >
                          <span className="truncate">{v.label}</span>
                          {v.id === activeVersionId && (
                            <span className="ml-3 text-[9px] font-black uppercase tracking-widest text-slate-500">
                              Active
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tools */}
                  {!!user && !isShared && (
                    <div className="mt-6">
                      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">Tools</p>

                      {(activeTool === "pin" || activeTool === "boundary") && (
                        <div className="mb-4 p-4 rounded-3xl bg-white/5 border border-white/10">
                          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Editing</p>
                          <p className="text-sm font-black text-white mt-2 tracking-tight">
                            {activeTool === "boundary" ? "Boundary" : "Drop-pin"} (on main image)
                          </p>
                          <p className="text-xs font-medium text-white/50 mt-1">
                            Click directly on the photo to add. Drag to move. Resize the logo using the corner handle.
                          </p>

                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => setAnnotationInitialTool("select")}
                              className={cn(
                                "h-10 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all",
                                annotationInitialTool === "select"
                                  ? "bg-white text-slate-950 border-white"
                                  : "bg-white/0 text-white/70 border-white/10 hover:bg-white/5"
                              )}
                            >
                              Move
                            </button>
                            <button
                              type="button"
                              onClick={() => setAnnotationInitialTool("pin")}
                              className={cn(
                                "h-10 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all",
                                annotationInitialTool === "pin"
                                  ? "bg-white text-slate-950 border-white"
                                  : "bg-white/0 text-white/70 border-white/10 hover:bg-white/5"
                              )}
                            >
                              Pin
                            </button>
                            <button
                              type="button"
                              onClick={() => setAnnotationInitialTool("boundary")}
                              className={cn(
                                "h-10 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all",
                                annotationInitialTool === "boundary"
                                  ? "bg-white text-slate-950 border-white"
                                  : "bg-white/0 text-white/70 border-white/10 hover:bg-white/5"
                              )}
                            >
                              Boundary
                            </button>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                proAnnotationRef.current?.clear();
                                setActiveTool("none");
                              }}
                              className="h-11 rounded-2xl bg-white/0 border border-white/10 text-white/80 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => proAnnotationRef.current?.save()}
                              className="h-11 rounded-2xl bg-white text-slate-950 text-[10px] font-black uppercase tracking-widest hover:scale-[1.01] transition-all shadow-lg"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      )}

                      {(activeTool === "social" || activeTool === "color") && selectedAsset && (
                        <div className="mb-4 p-4 rounded-3xl bg-white/5 border border-white/10">
                          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Editing</p>
                          <p className="text-sm font-black text-white mt-2 tracking-tight">
                            {activeTool === "color" ? "Colour" : "Social Crop"} (on main image)
                          </p>
                          <p className="text-xs font-medium text-white/50 mt-1">
                            {activeTool === "color"
                              ? "Adjust sliders and preview directly on the photo."
                              : "Choose a preset and zoom/position directly on the photo."}
                          </p>

                          {activeTool === "social" ? (
                            <div className="mt-4 space-y-3">
                              <div className="grid grid-cols-2 gap-2">
                                {SOCIAL_PRESETS.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() =>
                                      setSocialEditor((prev) => ({
                                        ...prev,
                                        activeTab: "crop",
                                        activePreset: p.id,
                                        aspect: p.ratio as any,
                                      }))
                                    }
                                    className={cn(
                                      "h-10 px-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center",
                                      socialEditor.activePreset === p.id
                                        ? "bg-white text-slate-950 border-white"
                                        : "bg-white/0 text-white/70 border-white/10 hover:bg-white/5"
                                    )}
                                  >
                                    {p.label}
                                  </button>
                                ))}
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                                    Zoom
                                  </span>
                                  <span className="text-[10px] font-black text-white/60">
                                    {Math.round((socialEditor.zoom || 1) * 100)}%
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min={1}
                                  max={3}
                                  step={0.01}
                                  value={socialEditor.zoom || 1}
                                  onChange={(e) =>
                                    setSocialEditor((prev) => ({ ...prev, zoom: Number(e.target.value) }))
                                  }
                                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="mt-4 space-y-3">
                              <div className="grid grid-cols-2 gap-2">
                                {SOCIAL_ADJUSTMENTS.map((a) => (
                                  <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => setSocialEditor((prev) => ({ ...prev, activeAdjId: a.id }))}
                                    className={cn(
                                      "h-10 px-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center",
                                      socialEditor.activeAdjId === a.id
                                        ? "bg-white text-slate-950 border-white"
                                        : "bg-white/0 text-white/70 border-white/10 hover:bg-white/5"
                                    )}
                                  >
                                    {a.label}
                                  </button>
                                ))}
                              </div>

                              {socialEditor.activeAdjId === "hue" && (
                                <div className="flex items-center justify-between gap-3">
                                  <input
                                    type="color"
                                    value={(() => {
                                      // derive a hue swatch from current hue by reusing the helper in SocialCropper (approx)
                                      const h = ((Number(socialEditor.adjustValues?.hue || 0) % 360) + 360) % 360;
                                      const s = 1;
                                      const l = 0.5;
                                      const c = (1 - Math.abs(2 * l - 1)) * s;
                                      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
                                      const m = l - c / 2;
                                      let r = 0, g = 0, b = 0;
                                      if (h < 60) [r, g, b] = [c, x, 0];
                                      else if (h < 120) [r, g, b] = [x, c, 0];
                                      else if (h < 180) [r, g, b] = [0, c, x];
                                      else if (h < 240) [r, g, b] = [0, x, c];
                                      else if (h < 300) [r, g, b] = [x, 0, c];
                                      else [r, g, b] = [c, 0, x];
                                      const to255 = (v: number) => Math.round((v + m) * 255);
                                      const toHex = (v: number) => to255(v).toString(16).padStart(2, "0");
                                      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
                                    })()}
                                    onChange={(e) => {
                                      // quick hex->hue conversion
                                      const m = /^#?([0-9a-f]{6})$/i.exec(e.target.value || "");
                                      if (!m) return;
                                      const int = parseInt(m[1], 16);
                                      const r = ((int >> 16) & 255) / 255;
                                      const g = ((int >> 8) & 255) / 255;
                                      const b = (int & 255) / 255;
                                      const max = Math.max(r, g, b);
                                      const min = Math.min(r, g, b);
                                      const d = max - min;
                                      let h = 0;
                                      if (d === 0) h = 0;
                                      else if (max === r) h = ((g - b) / d) % 6;
                                      else if (max === g) h = (b - r) / d + 2;
                                      else h = (r - g) / d + 4;
                                      h = Math.round(h * 60);
                                      if (h < 0) h += 360;
                                      setSocialEditor((prev) => ({
                                        ...prev,
                                        adjustValues: { ...prev.adjustValues, hue: h },
                                      }));
                                    }}
                                    className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 p-0 overflow-hidden cursor-pointer"
                                    aria-label="Hue color picker"
                                  />
                                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                                    Hue swatch
                                  </p>
                                </div>
                              )}

                              {socialEditor.activeAdjId === "luminance" && (
                                <div className="flex items-center justify-between gap-3">
                                  <input
                                    type="color"
                                    value={socialEditor.luminanceTargetHex || "#ffffff"}
                                    onChange={(e) =>
                                      setSocialEditor((prev) => ({ ...prev, luminanceTargetHex: e.target.value }))
                                    }
                                    className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 p-0 overflow-hidden cursor-pointer"
                                    aria-label="Luminance target color picker"
                                  />
                                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                                    Target color
                                  </p>
                                </div>
                              )}

                              {(() => {
                                const a = SOCIAL_ADJUSTMENTS.find((x) => x.id === socialEditor.activeAdjId);
                                if (!a) return null;
                                const v = Number(socialEditor.adjustValues?.[a.id] ?? a.defaultValue);
                                return (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                                        {a.label}
                                      </span>
                                      <span className="text-[10px] font-black text-white/60">
                                        {v}
                                        {a.unit}
                                      </span>
                                    </div>
                                    <input
                                      type="range"
                                      min={a.min}
                                      max={a.max}
                                      step={1}
                                      value={v}
                                      onChange={(e) =>
                                        setSocialEditor((prev) => ({
                                          ...prev,
                                          adjustValues: { ...prev.adjustValues, [a.id]: Number(e.target.value) },
                                        }))
                                      }
                                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                                    />
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSocialEditor((prev) => ({
                                  ...prev,
                                  crop: { x: 0, y: 0 },
                                  zoom: 1,
                                  aspect: undefined,
                                  activePreset: "original",
                                  croppedAreaPixels: null,
                                  activeTab: activeTool === "color" ? "adjust" : "crop",
                                  activeAdjId: prev.activeAdjId,
                                }));
                                setActiveTool("none");
                              }}
                              className="h-11 rounded-2xl bg-white/0 border border-white/10 text-white/80 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const exportImageUrl = selectedAsset?.path
                                    ? `/api/dropbox/download/${gallery.id}?path=${encodeURIComponent(selectedAsset.path)}&sharedLink=${encodeURIComponent(String(gallery.metadata?.dropboxLink || ""))}&applyBranding=false`
                                    : activeImageSrc;

                                  const blob = await generateSocialEditBlob({
                                    previewImageUrl: activeImageSrc,
                                    exportImageUrl,
                                    state: {
                                      ...socialEditor,
                                      activeTab: activeTool === "color" ? "adjust" : "crop",
                                    },
                                    mime: "image/jpeg",
                                    quality: 0.95,
                                  });

                                  const persistUrl = URL.createObjectURL(blob);
                                  const downloadUrl = URL.createObjectURL(blob);
                                  addVersion(selectedAsset, {
                                    id: `social-${Date.now()}`,
                                    label: activeTool === "color" ? "Colour" : "Social",
                                    tool: activeTool,
                                    kind: "blob",
                                    src: persistUrl,
                                    blob,
                                  });

                                  const editedAsset = {
                                    ...selectedAsset,
                                    id: `social-${selectedAsset.id}`,
                                    name: `${activeTool === "color" ? "Colour" : "Social"}-${selectedAsset.name}`,
                                    isMarkup: true,
                                    markupBlob: blob,
                                    originalPath: selectedAsset.path,
                                    originalName: selectedAsset.name,
                                    url: downloadUrl,
                                  };
                                  setDownloadAssets([editedAsset]);
                                  setIsDownloadManagerOpen(true);
                                  setActiveTool("none");
                                } catch (e: any) {
                                  alert(e?.message || "Failed to apply edit.");
                                }
                              }}
                              className="h-11 rounded-2xl bg-white text-slate-950 text-[10px] font-black uppercase tracking-widest hover:scale-[1.01] transition-all shadow-lg"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Request Revision markup controls while drawing (kept in right rail so nothing blocks the image). */}
                      {isDrawingMode && activeTool === "request" && (
                        <div className="mb-4 p-4 rounded-3xl bg-emerald-500/10 border border-emerald-400/25">
                          <p className="text-[10px] font-black text-emerald-200/80 uppercase tracking-widest">Markup</p>
                          <p className="text-sm font-black text-white mt-2 tracking-tight">Request Revision (on main image)</p>
                          <p className="text-xs font-medium text-white/60 mt-1">
                            Draw directly on the photo. Click Done when finished.
                          </p>

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setRevisionUiTool("pen");
                                revisionCanvasRef.current?.setTool("pen");
                              }}
                              className={cn(
                                "h-10 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all",
                                revisionUiTool === "pen"
                                  ? "bg-white text-slate-950 border-white"
                                  : "bg-white/0 text-white/80 border-white/10 hover:bg-white/5"
                              )}
                            >
                              Brush
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRevisionUiTool("eraser");
                                revisionCanvasRef.current?.setTool("eraser");
                              }}
                              className={cn(
                                "h-10 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all",
                                revisionUiTool === "eraser"
                                  ? "bg-white text-slate-950 border-white"
                                  : "bg-white/0 text-white/80 border-white/10 hover:bg-white/5"
                              )}
                            >
                              Eraser
                            </button>
                          </div>

                          <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Brush size</span>
                              <span className="text-[10px] font-black text-white/70">{revisionUiBrush}px</span>
                            </div>
                            <input
                              type="range"
                              min={8}
                              max={160}
                              step={1}
                              value={revisionUiBrush}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setRevisionUiBrush(v);
                                revisionCanvasRef.current?.setBrushSize(v);
                              }}
                              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                              aria-label="Brush size"
                            />
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                revisionCanvasRef.current?.clear();
                                setIsDrawingMode(false);
                                setIsRequestingEdit(true);
                              }}
                              className="h-11 rounded-2xl bg-white/0 border border-white/10 text-white/85 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => revisionCanvasRef.current?.save()}
                              className="h-11 rounded-2xl bg-white text-slate-950 text-[10px] font-black uppercase tracking-widest hover:scale-[1.01] transition-all shadow-lg"
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      )}

                      {isSpotRemovalOpen && activeTool === "spot" && (
                        <div className="mb-4 p-4 rounded-3xl bg-white/5 border border-white/10">
                          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Editing</p>
                          <p className="text-sm font-black text-white mt-2 tracking-tight">Item Removal (on main image)</p>
                          <p className="text-xs font-medium text-white/50 mt-1">
                            Paint pink over what you want removed. Use eraser to refine. Then Apply.
                          </p>

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSpotUiTool("pen");
                                spotCanvasRef.current?.setTool("pen");
                              }}
                              className={cn(
                                "h-10 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all",
                                spotUiTool === "pen"
                                  ? "bg-white text-slate-950 border-white"
                                  : "bg-white/0 text-white/70 border-white/10 hover:bg-white/5"
                              )}
                            >
                              Brush
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSpotUiTool("eraser");
                                spotCanvasRef.current?.setTool("eraser");
                              }}
                              className={cn(
                                "h-10 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all",
                                spotUiTool === "eraser"
                                  ? "bg-white text-slate-950 border-white"
                                  : "bg-white/0 text-white/70 border-white/10 hover:bg-white/5"
                              )}
                            >
                              Eraser
                            </button>
                          </div>

                          <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Brush size</span>
                              <span className="text-[10px] font-black text-white/60">{spotUiBrush}px</span>
                            </div>
                            <input
                              type="range"
                              min={8}
                              max={160}
                              step={1}
                              value={spotUiBrush}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setSpotUiBrush(v);
                                spotCanvasRef.current?.setBrushSize(v);
                              }}
                              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-pink-500"
                              aria-label="Brush size"
                            />
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                spotCanvasRef.current?.clear();
                                setIsSpotRemovalOpen(false);
                                setSpotRemovalError(null);
                                setActiveTool("none");
                              }}
                              className="h-11 rounded-2xl bg-white/0 border border-white/10 text-white/80 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => spotCanvasRef.current?.save()}
                              className="h-11 rounded-2xl bg-white text-slate-950 text-[10px] font-black uppercase tracking-widest hover:scale-[1.01] transition-all shadow-lg"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        {TOOLBAR.unlocked.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              (t as any).onClick?.();
                            }}
                            className={cn(
                              "group relative w-full h-10 px-4 rounded-2xl text-left text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border",
                              // Request Revision is the primary, non-AI workflow: keep a subtle green glow even when idle.
                              t.id === "revision" && activeTool !== "request" &&
                                "bg-emerald-500/14 border-emerald-300/45 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.26),0_0_26px_rgba(16,185,129,0.22)] hover:bg-emerald-500/18 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.30),0_0_34px_rgba(16,185,129,0.26)]",
                              (t.id === "social" && activeTool === "social") ||
                                (t.id === "color" && activeTool === "color") ||
                                (t.id === "pin" && activeTool === "pin") ||
                                (t.id === "boundary" && activeTool === "boundary") ||
                                (t.id === "revision" && activeTool === "request")
                                ? "bg-emerald-500/22 border-emerald-200/70 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.34),0_0_44px_rgba(16,185,129,0.32)]"
                                : "bg-white/5 hover:bg-white/10 text-white/90 border-white/10"
                            )}
                            title={t.label}
                            aria-label={t.label}
                          >
                            <t.icon className="h-3.5 w-3.5" />
                            <span className="truncate">{t.label}</span>
                            <span
                              className={cn(
                                "pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full z-[200] whitespace-nowrap",
                                "px-3 py-1 rounded-xl bg-slate-950/95 border border-white/10 shadow-xl",
                                "text-[10px] font-black uppercase tracking-widest text-white/85",
                                "opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150"
                              )}
                            >
                              {String((t as any).description || t.label)}
                            </span>
                          </button>
                        ))}

                        {TOOLBAR.locked.map((t) => {
                          const aiReady = aiSuiteUnlocked && aiSuiteRemainingEdits > 0;
                          const aiSelected =
                            (activeTool === "ai" || activeTool === "spot") &&
                            ((t.id === "day_to_dusk" && aiRequestedAction === "day_to_dusk") ||
                              (t.id === "remove" && aiRequestedAction === "remove_furniture") ||
                              (t.id === "spot" && aiRequestedAction === "spot_removal") ||
                              (t.id === "replace" && aiRequestedAction === "replace_furniture") ||
                              (t.id === "advanced" && aiRequestedAction === "advanced_prompt"));
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                (t as any).onClick?.();
                              }}
                              className={cn(
                                "group relative w-full h-10 px-4 rounded-2xl text-left text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border",
                                aiSelected && "shadow-[0_0_0_1px_rgba(16,185,129,0.25),0_0_24px_rgba(16,185,129,0.18)]",
                                aiReady
                                  ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-white border-emerald-500/25"
                                  : "bg-white/5 hover:bg-white/10 text-white/70 border-white/10"
                              )}
                              title={t.label}
                              aria-label={t.label}
                            >
                              <t.icon className="h-3.5 w-3.5" />
                              <span className="truncate">{t.label}</span>
                              <span className="ml-auto h-6 w-6 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center">
                                {aiReady ? (
                                  <Zap className="h-3.5 w-3.5 text-emerald-400" />
                                ) : (
                                  <Lock className="h-3.5 w-3.5 text-white/80" />
                                )}
                              </span>
                              <span
                                className={cn(
                                  "pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full z-[200] whitespace-nowrap",
                                  "px-3 py-1 rounded-xl bg-slate-950/95 border border-white/10 shadow-xl",
                                  "text-[10px] font-black uppercase tracking-widest text-white/85",
                                  "opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150"
                                )}
                              >
                                {String((t as any).description || t.label)}
                              </span>
                            </button>
                          );
                        })}

                        {TOOLBAR.comingSoon.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            disabled
                            className="group relative w-full h-10 px-4 rounded-2xl bg-white/5 text-white/30 text-left text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border border-white/10 cursor-not-allowed"
                            title={`${t.label} (coming soon)`}
                            aria-label={`${t.label} (coming soon)`}
                          >
                            <t.icon className="h-3.5 w-3.5" />
                            <span className="truncate">{t.label}</span>
                            <span
                              className={cn(
                                "pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full z-[200] whitespace-nowrap",
                                "px-3 py-1 rounded-xl bg-slate-950/95 border border-white/10 shadow-xl",
                                "text-[10px] font-black uppercase tracking-widest text-white/85",
                                "opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150"
                              )}
                            >
                              {String((t as any).description || t.label)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </aside>
            </div>

          {/* Social/Colour now run as an embedded overlay on the main image (Photoshop-style). */}

          {isAISuiteOpen && selectedAsset && (
            <AISuiteDrawer
              isOpen={isAISuiteOpen}
              onClose={() => {
                setIsAISuiteOpen(false);
                setActiveTool("none");
              }}
              galleryId={gallery.id}
              assetUrl={activeVersion?.kind === "blob" ? getImageUrl(selectedAsset.url, "w2048h1536") : activeImageSrc}
              assetName={selectedAsset.name}
              dbxPath={selectedAsset.path}
              tenantId={gallery.tenantId}
              isUnlocked={aiSuiteUnlocked}
              remainingEdits={aiSuiteRemainingEdits}
              onRequireUnlock={() => {
                setAiSuiteTermsAccepted(false);
                setIsAiSuiteUnlockOpen(true);
              }}
              onAiSuiteUpdate={(next) => setAiSuiteState((prev: any) => ({ ...(prev || {}), ...(next || {}) }))}
              requestedAction={
                aiRequestedAction && aiRequestedAction !== "spot_removal" ? aiRequestedAction : undefined
              }
              requestedActionNonce={aiRequestedNonce}
              onComplete={(newUrl) => {
                addVersion(selectedAsset, {
                  id: `ai-${Date.now()}`,
                  label: "AI Result",
                  tool: "ai",
                  kind: "url",
                  src: newUrl,
                });
              }}
            />
          )}

          {isAiSocialVideoOpen && (
            <AISocialVideoPicker
              isOpen={isAiSocialVideoOpen}
              onClose={() => {
                setIsAiSocialVideoOpen(false);
                setAiSocialVideoError(null);
              }}
              images={assets.filter((a) => isImageAsset(a))}
              getThumbUrl={(url: string) => getImageUrl(url, "w480h320")}
              isGenerating={isAiSocialVideoGenerating}
              error={aiSocialVideoError}
              onGenerate={async (ordered: any[], opts: { durationSeconds: 5 | 10 }) => {
                setAiSocialVideoError(null);
                setIsAiSocialVideoGenerating(true);
                try {
                  const res = await fetch("/api/ai/social-video/start", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      galleryId: gallery.id,
                      durationSeconds: opts?.durationSeconds,
                      orderedAssets: ordered.map((a: any) => ({
                        id: a?.id || null,
                        name: a?.name || null,
                        url: a?.url,
                        path: a?.path || null,
                      })),
                    }),
                  });
                  const data = await res.json().catch(() => null);
                  if (!res.ok || !data?.success) {
                    const code = String(data?.code || data?.error || "");
                    if (code === "AI_SUITE_LOCKED" || code === "AI_SUITE_LIMIT" || code === "AI_SUITE_VIDEO_LIMIT") {
                      setPostUnlockAction("ai_social_video");
                      setAiSuiteTermsAccepted(false);
                      setIsAiSuiteUnlockOpen(true);
                      setIsAiSocialVideoOpen(false);
                      return;
                    }
                    setAiSocialVideoError(String(data?.error || "Failed to start video generation."));
                    return;
                  }

                  if (data?.aiSuite) {
                    setAiSuiteState((prev: any) => ({ ...(prev || {}), ...(data.aiSuite || {}) }));
                  }

                  const predictionId = String(data.predictionId || "");
                  if (!predictionId) {
                    setAiSocialVideoError("Failed to start video generation (missing prediction id).");
                    return;
                  }

                  // Poll for completion
                  const pollUntilDone = async () => {
                    const startedAt = Date.now();
                    while (Date.now() - startedAt < 5 * 60_000) {
                      await new Promise((r) => setTimeout(r, 2000));
                      const pr = await fetch(
                        `/api/ai/social-video/poll/${encodeURIComponent(predictionId)}?galleryId=${encodeURIComponent(gallery.id)}`,
                        { cache: "no-store" }
                      );
                      const pd = await pr.json().catch(() => null);
                      if (!pr.ok || !pd?.success) {
                        setAiSocialVideoError(String(pd?.error || "Video generation failed."));
                        return null;
                      }
                      if (pd.status === "succeeded" && pd.videoUrl) return String(pd.videoUrl);
                      if (pd.status === "failed" || pd.status === "canceled") {
                        setAiSocialVideoError(String(pd?.error || "Video generation failed."));
                        return null;
                      }
                    }
                    setAiSocialVideoError("Timed out waiting for video. Please try again.");
                    return null;
                  };

                  const videoUrl = await pollUntilDone();
                  if (!videoUrl) return;

                  // Optimistically add to local state (server also persists)
                  setVideos((prev) => [
                    ...(Array.isArray(prev) ? prev : []),
                    { url: videoUrl, title: "AI Social Video", createdAt: new Date().toISOString(), kind: "AI_SOCIAL" },
                  ]);
                  setIsAiSocialVideoOpen(false);
                } catch (e: any) {
                  setAiSocialVideoError(e?.message || "Failed to generate video.");
                } finally {
                  setIsAiSocialVideoGenerating(false);
                }
              }}
            />
          )}

          {isAiSuiteUnlockOpen && (
            <div className="fixed inset-0 z-[250] flex items-center justify-center p-6">
              <div
                className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
                onClick={() => setIsAiSuiteUnlockOpen(false)}
              />
              <div
                className="relative w-full max-w-xl bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Premium Feature</p>
                    <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                      Unlock AI Suite
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsAiSuiteUnlockOpen(false)}
                    className="h-12 w-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 transition-all active:scale-95"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <div className="p-8 space-y-6">
                  <div className="p-6 rounded-[28px] bg-slate-50 border border-slate-100">
                    <p className="text-sm font-bold text-slate-900">
                      This gallery includes a premium AI editor for:
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-600 font-medium">
                      <li>- Item removal</li>
                      <li>- Day to dusk transitions</li>
                      <li>- Furniture replacement (styles)</li>
                      <li>- And more</li>
                    </ul>
                  </div>

                  <div className="flex items-center justify-between p-6 rounded-[28px] border border-emerald-100 bg-emerald-50/50">
                    <div>
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">One-off fee</p>
                      <p className="text-xl font-black text-slate-900">{unlockFlowIsTrial ? "$0" : "$50"}</p>
                      <p className="text-xs font-bold text-slate-500 mt-1">
                        Includes a maximum of <span className="text-slate-900">15 edits</span> for this gallery.
                      </p>
                      {tenantFreeAiSuitePacksRemaining > 0 && (
                        <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mt-2">
                          Free trial pack available • 1 per tenant
                        </p>
                      )}
                    </div>
                    <div className="px-3 py-1 rounded-full bg-white border border-emerald-100 text-emerald-600 text-[10px] font-black uppercase tracking-widest">
                      {aiSuiteUnlocked && aiSuiteRemainingEdits <= 0 ? (canUseFreeAiSuitePack ? "FREE TRIAL" : "RE-PURCHASE") : (canUseFreeAiSuitePack ? "FREE TRIAL" : "UNLOCK")}
                    </div>
                  </div>

                  {!user?.role && (
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold">
                      Please log in to unlock AI Suite.
                    </div>
                  )}

                  {!unlockFlowIsTrial && !canUsePaidAiSuiteUnlock && (
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 text-amber-700 text-xs font-bold">
                      Paid AI unlocks are currently disabled for this studio. Please ask the platform admin to enable paid AI for your workspace.
                    </div>
                  )}

                  {aiSuiteUnlockError && (
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold">
                      {aiSuiteUnlockError}
                    </div>
                  )}

                  <label className="flex items-start gap-3 p-4 rounded-2xl border border-slate-100 bg-white">
                    <input
                      type="checkbox"
                      checked={aiSuiteTermsAccepted}
                      onChange={(e) => setAiSuiteTermsAccepted(e.target.checked)}
                      className="mt-1 h-4 w-4"
                      disabled={!user?.role}
                    />
                    <span className="text-sm font-medium text-slate-600">
                      I understand this is a premium feature{canUseFreeAiSuitePack ? " and this unlock will be covered by my studio’s free trial pack." : " and the $50 unlock will be invoiced by the studio for this gallery."}
                    </span>
                  </label>

                  <button
                    disabled={!user?.role || !aiSuiteTermsAccepted || isAiSuiteUnlocking || !unlockAllowed}
                    onClick={async () => {
                      if (!user?.role) return;
                      if (!aiSuiteTermsAccepted) return;
                      setAiSuiteUnlockError(null);
                      setIsAiSuiteUnlocking(true);
                      try {
                        const res = await unlockAiSuiteForGallery(gallery.id);
                        if (res.success) {
                          setAiSuiteState(res.aiSuite);
                          setIsAiSuiteUnlockOpen(false);
                          if (postUnlockAction === "ai_social_video") {
                            setPostUnlockAction(null);
                            // Let the modal close before opening the picker
                            setTimeout(() => openAiSocialVideo(), 50);
                          } else if (postUnlockAction) {
                            const map: Record<string, any> = {
                              ai_day_to_dusk: "day_to_dusk",
                              ai_remove_furniture: "remove_furniture",
                              ai_replace_furniture: "replace_furniture",
                              ai_advanced_prompt: "advanced_prompt",
                              ai_spot_removal: "spot_removal",
                            };
                            const next = map[String(postUnlockAction)];
                            setPostUnlockAction(null);
                            if (next) {
                              if (next === "spot_removal") {
                                // Let the modal close before opening the paint overlay
                                setTimeout(() => openLockedSpotRemoval(), 50);
                              } else {
                              setAiRequestedAction(next);
                              setAiRequestedNonce((n) => n + 1);
                              // Let the modal close before opening the drawer
                              setTimeout(() => {
                                setActiveTool("ai");
                                setIsAISuiteOpen(true);
                              }, 50);
                              }
                            }
                          }
                        } else {
                          if (res.error === "AI_DISABLED") {
                            setAiSuiteUnlockError(
                              "Paid AI unlocks are disabled for this studio. You can still use the free trial pack if available.",
                            );
                          } else {
                            setAiSuiteUnlockError(res.error || "Failed to unlock AI Suite.");
                          }
                        }
                      } finally {
                        setIsAiSuiteUnlocking(false);
                      }
                    }}
                    className={cn(
                      "w-full h-14 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all",
                      (!user?.role || !aiSuiteTermsAccepted || isAiSuiteUnlocking || !unlockAllowed)
                        ? "bg-slate-200 text-slate-400"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    )}
                  >
                    {isAiSuiteUnlocking
                      ? "Unlocking..."
                      : aiSuiteUnlocked && aiSuiteRemainingEdits <= 0
                        ? (unlockFlowIsTrial ? "Unlock 15 edits (Free Trial)" : "Unlock another 15 edits ($50)")
                        : (unlockFlowIsTrial ? "Unlock AI Suite (Free Trial)" : "Unlock AI Suite ($50)")}
                  </button>
                </div>

                <div className="px-8 py-6 bg-slate-50 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 text-center uppercase tracking-widest">
                    Unlock is per-gallery • 15 edits included
                  </p>
                </div>
              </div>
            </div>
          )}

          {isCopyModalOpen && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
              <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-md" onClick={() => setIsCopyModalOpen(false)} />
              <div className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="px-8 py-8 border-b border-slate-50 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight">Property Listing</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{gallery.title}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsCopyModalOpen(false)}
                    className="h-10 w-10 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                  <div className="prose prose-slate max-w-none text-sm font-medium leading-relaxed whitespace-pre-wrap text-slate-600">
                    {gallery.aiCopy}
                  </div>
                </div>
                <div className="p-8 border-t border-slate-50 bg-slate-50/50 flex justify-end">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(gallery.aiCopy);
                      alert("Copied to clipboard!");
                    }}
                    className="h-12 px-8 rounded-2xl bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all shadow-lg"
                  >
                    Copy Text
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Download Manager Overlay - Moved outside Lightbox */}

          {/* Edit Request Details Form (Slide-over style inside lightbox) */}
          {/* Hide while drawing so the main image is fully usable (no UI blocking the canvas). */}
          {isRequestingEdit && !isDrawingMode && (
            <div className="absolute inset-0 z-[60] flex items-center justify-end p-4 md:p-8 bg-transparent pointer-events-none animate-in fade-in duration-300">
              <div 
                className="w-full max-w-[860px] bg-white rounded-[28px] shadow-2xl overflow-hidden flex flex-col h-full max-h-[760px] animate-in slide-in-from-right duration-500 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-5 md:p-6 border-b border-slate-50 flex items-center justify-between shrink-0">
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
                      setActiveTool("none");
                      setDrawingData(null);
                      setEditNote("");
                      setSelectedTagIds([]);
                    }}
                    className="h-10 w-10 rounded-full hover:bg-slate-50 flex items-center justify-center text-slate-400"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                  {/* Left Column: Visual Marking (Drawing) */}
                  <div className="w-full lg:w-[38%] p-5 md:p-6 border-b lg:border-b-0 lg:border-r border-slate-50 overflow-y-auto custom-scrollbar">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                        Visual Marking (Optional)
                        {drawingData && !isDrawingMode && (
                          <button 
                            type="button"
                            onClick={() => startRevisionMarkup()}
                            className="text-primary hover:underline text-[9px] font-black"
                          >
                            EDIT MARKUP
                          </button>
                        )}
                      </label>
                      
                      {isDrawingMode ? (
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 space-y-4">
                          <div className="space-y-1">
                            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Drawing on main image</p>
                            <p className="text-xs font-semibold text-slate-700">
                              Paint directly on the photo. Click Done when finished.
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setRevisionUiTool("pen");
                                revisionCanvasRef.current?.setTool("pen");
                              }}
                              className={cn(
                                "h-10 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all",
                                revisionUiTool === "pen"
                                  ? "bg-slate-900 text-white border-slate-900"
                                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                              )}
                            >
                              Brush
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRevisionUiTool("eraser");
                                revisionCanvasRef.current?.setTool("eraser");
                              }}
                              className={cn(
                                "h-10 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all",
                                revisionUiTool === "eraser"
                                  ? "bg-slate-900 text-white border-slate-900"
                                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                              )}
                            >
                              Eraser
                            </button>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Brush size</span>
                              <span className="text-[10px] font-black text-slate-700">{revisionUiBrush}px</span>
                            </div>
                            <input
                              type="range"
                              min={8}
                              max={160}
                              step={1}
                              value={revisionUiBrush}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setRevisionUiBrush(v);
                                revisionCanvasRef.current?.setBrushSize(v);
                              }}
                              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                              aria-label="Brush size"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                revisionCanvasRef.current?.clear();
                                setIsDrawingMode(false);
                              }}
                              className="h-11 rounded-2xl bg-white border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:border-slate-300 transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => revisionCanvasRef.current?.save()}
                              className="h-11 rounded-2xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-[0_10px_20px_-12px_rgba(16,185,129,0.6)]"
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      ) : drawingData ? (
                        <div 
                          onClick={() => startRevisionMarkup()}
                          className="aspect-square rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden relative group cursor-pointer"
                        >
                          <img
                            src={getImageUrl(selectedAsset.url, "w1024h768")}
                            className="absolute inset-0 h-full w-full object-contain"
                            alt="Marked preview"
                          />

                          {/* Overlay the user's saved markups so they remain visible while typing notes */}
                          {Array.isArray(drawingData) && (
                            <svg
                              className="absolute inset-0 h-full w-full"
                              viewBox="0 0 1 1"
                              preserveAspectRatio="none"
                            >
                              {drawingData
                                .filter((d: any) => d?.type === "path" && d?.tool !== "eraser" && Array.isArray(d?.points) && d.points.length >= 2)
                                .map((d: any, idx: number) => {
                                  const pts = d.points as { x: number; y: number }[];
                                  const pathD = `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
                                  return (
                                    <path
                                      key={`p-${idx}`}
                                      d={pathD}
                                      fill="none"
                                      stroke="rgba(255, 0, 0, 0.9)"
                                      strokeWidth={0.008}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  );
                                })}
                              {drawingData
                                .filter((d: any) => d?.type === "text" && typeof d?.content === "string")
                                .map((d: any) => (
                                  <text
                                    key={`t-${d.id || `${d.x}-${d.y}`}`}
                                    x={Number(d.x) || 0}
                                    y={Number(d.y) || 0}
                                    fill="rgba(255, 0, 0, 0.95)"
                                    fontSize={0.045}
                                    fontWeight={800}
                                    dominantBaseline="middle"
                                    textAnchor="middle"
                                  >
                                    {String(d.content).slice(0, 40)}
                                  </text>
                                ))}
                            </svg>
                          )}

                          <div className="absolute inset-0 flex items-end justify-end p-3">
                            <span className="px-3 py-1 rounded-full bg-white/90 border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-900 shadow-sm">
                              Markup Attached
                            </span>
                          </div>
                        </div>
                      ) : (
                        <button 
                          type="button"
                          onClick={() => startRevisionMarkup()}
                          className="w-full aspect-square rounded-2xl border-2 border-dashed border-slate-200 hover:border-primary/40 hover:bg-primary/[0.02] transition-all flex flex-col items-center justify-center gap-3 group"
                        >
                          <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-primary group-hover:bg-primary/10 transition-all">
                            <PenTool className="h-5 w-5" />
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Draw on Photo</p>
                            <p className="text-[9px] font-medium text-slate-500 mt-1 max-w-[180px] mx-auto">
                              Circle specific areas you want our editors to focus on.
                            </p>
                          </div>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Edit Types & Instructions */}
                  <div className="w-full lg:w-[60%] flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6 custom-scrollbar">
                      {/* Edit Tags (Multi-select) */}
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Select Edit Type</label>
                        <div className="grid grid-cols-2 gap-2">
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
                                  "flex items-center justify-between px-3 py-2 rounded-xl text-[11px] font-bold transition-all border text-left",
                                  isSelected 
                                    ? "bg-primary border-primary text-white shadow-lg shadow-primary/20" 
                                    : "bg-white border-slate-200 text-slate-600 hover:border-primary hover:text-primary"
                                )}
                              >
                                <span>{tag.name}</span>
                                <span className={cn(
                                  "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest shrink-0",
                                  isSelected ? "bg-white/20 text-white" : "bg-slate-50 text-slate-400"
                                )}>
                                  ${tag.cost}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Note */}
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Additional Instructions</label>
                        <textarea 
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          placeholder="e.g. Please remove the car and also the green bin on the left..."
                          className="w-full h-28 rounded-2xl border border-slate-200 p-4 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                        />
                      </div>
                    </div>

                    {/* Sticky Footer */}
                    <div className="p-5 md:p-6 border-t border-slate-50 bg-slate-50/50 shrink-0">
                      {editSuccess ? (
                        <div className="h-14 w-full rounded-2xl bg-emerald-500 text-white flex items-center justify-center gap-2 animate-in zoom-in duration-300">
                          <Check className="h-5 w-5" />
                          <span className="font-bold">Request Submitted!</span>
                        </div>
                      ) : (
                        <button 
                          type="button"
                          onClick={handleSubmitEditRequest}
                          disabled={isSubmittingEdit || (selectedTagIds.length === 0 && !editNote && !drawingData && !annotationData)}
                          className="h-12 w-full rounded-2xl bg-slate-900 text-white font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow-xl disabled:opacity-50 disabled:hover:scale-100"
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
              </div>
            </div>
          )}

          {/* Drawing for Request Revision now happens as an EMBEDDED overlay on the main image (Photoshop-style). */}

          {/* Item/Spot Removal now paints on the main image (Photoshop-style). */}

          {isSpotRemovalProcessing && (
            <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px]">
              <div className="px-6 py-4 rounded-2xl bg-slate-950 border border-white/10 shadow-2xl flex items-center gap-3">
                <Loader2 className="h-5 w-5 text-white animate-spin" />
                <p className="text-xs font-black uppercase tracking-widest text-white/90">Removing item…</p>
              </div>
            </div>
          )}

          {spotRemovalError && !isSpotRemovalOpen && !isSpotRemovalProcessing && (
            <div className="fixed inset-x-0 bottom-6 z-[141] flex justify-center px-6">
              <div className="max-w-[720px] w-full px-5 py-4 rounded-2xl bg-rose-500 text-white shadow-2xl border border-rose-400/40">
                <p className="text-xs font-black uppercase tracking-widest">Item removal</p>
                <p className="text-sm font-bold mt-1">{spotRemovalError}</p>
              </div>
            </div>
          )}

          {/* AI suite is prompt-only: no mask overlay */}
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
          onSend={(comments) => {
            // We need to set comments AND then trigger submission.
            // Since setVideoComments is async, we can pass it to handleSubmitEditRequest 
            // if we refactor it slightly.
            submitVideoComments(comments, []);
          }}
          isSubmitting={isSubmittingEdit}
          editSuccess={editSuccess}
          editTags={editTags}
        />
      )}

      {/* Simple Footer */}
      <footer className="py-20 border-t border-slate-100 bg-slate-50/50">
        <div className="max-w-[103rem] mx-auto px-6 text-center">
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
              tenantId={tenant?.id || gallery?.tenantId}
              assets={downloadAssets}
              sharedLink={gallery.metadata?.dropboxLink}
              onClose={() => {
                // Cleanup temporary URLs to prevent memory leaks
                downloadAssets.forEach(asset => {
                  if (asset.url?.startsWith('blob:')) {
                    URL.revokeObjectURL(asset.url);
                  }
                });
                setIsDownloadManagerOpen(false);
              }}
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

      {/* Choice Modal removed (toolbar is always visible in the viewer header) */}

      {/* ProAnnotationCanvas is now embedded directly on the main image (Photoshop-style). */}
    </div>
  );
}

function HighResBannerLayer({
  src,
  alt,
  onError,
}: {
  src: string;
  alt: string;
  onError: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={false}
      className={cn("object-cover transition-opacity duration-700", loaded ? "opacity-100" : "opacity-0")}
      sizes="(max-width: 1280px) 100vw, 1280px"
      onLoad={() => setLoaded(true)}
      onError={onError}
    />
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
 * Progressive Image Loader using next/image
 */
function ProgressiveImage({ src, alt, className, getImageUrl, priority, directUrl }: { 
  src: string,
  alt: string,
  className: string,
  getImageUrl: (url: string, size?: string) => string,
  priority?: boolean,
  directUrl?: string
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const optimizedSrc = getImageUrl(src, "w480h320");
  
  // Robust fallback logic:
  // 1. Try optimized proxy URL
  // 2. If it fails, try the original direct link (if available)
  // 3. Last resort: format the current src (proxy) which usually won't help but is a safe fallback
  const finalSrc = hasError 
    ? (directUrl || formatDropboxUrl(src)) 
    : optimizedSrc;

  return (
    <div 
      // Square-edge tiles + allow natural height so masonry can pack correctly
      className="relative w-full overflow-hidden bg-slate-50"
    >
      <Image 
        src={finalSrc}
        alt={alt}
        width={1200}
        height={800}
        priority={priority}
        className={cn(
          className,
          "object-cover transition-all duration-500",
          !isLoaded ? "blur-md scale-105 opacity-50" : "blur-0 scale-100 opacity-100"
        )}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          console.error("[IMAGE] Failed to load:", finalSrc);
          setHasError(true);
        }}
        // Let the image size itself naturally in the flow; width is 100% via className passed in.
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
      />
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

