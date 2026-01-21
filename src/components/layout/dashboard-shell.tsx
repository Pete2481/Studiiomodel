"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ReactNode, useState, useEffect, useMemo, useRef, Suspense } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { NavSection } from "@/lib/nav-config";
import { 
  Search, 
  LogOut, 
  HelpCircle,
  LayoutDashboard,
  Building2,
  Calendar,
  ImageIcon,
  Paintbrush,
  Bell,
  Newspaper,
  Users,
  Receipt,
  Wrench,
  Camera,
  Scissors,
  Settings,
  Plus,
  ChartColumn,
  X,
  UserPlus,
  Menu,
  ChevronLeft,
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Link as LinkIcon, 
  Copy, 
  Check, 
  TrendingUp, 
  LayoutDashboard as DashboardIcon, 
  Activity
} from "lucide-react";
import { signOut } from "next-auth/react";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { DashboardProvider, useDashboard } from "./dashboard-context";
import { GlobalSearch } from "./global-search";
import { GuideProvider, useGuide } from "./guide-context";
import { Hint } from "@/components/ui";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { NavigationPrefetcher } from "./navigation-prefetcher";
import { ProgressBar } from "./progress-bar";
import dynamic from "next/dynamic";
import Image from "next/image";
import { formatDropboxUrl } from "@/lib/utils";
import { NavigationIntentOverlay } from "./navigation-intent-overlay";

const QuickActionModals = dynamic(() => import("./modals/quick-action-modals"), {
  loading: () => null,
});

import { APP_VERSION } from "@/lib/version";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const IconMap: Record<string, any> = {
  LayoutDashboard,
  Building2,
  Calendar,
  Image: ImageIcon,
  Paintbrush,
  Bell,
  Newspaper,
  Users,
  Receipt,
  Wrench,
  Camera,
  Scissors,
  Settings, 
  Plus, 
  ChartColumn, 
  TrendingUp, 
  Activity
};

interface DashboardShellProps {
  children: ReactNode;
  navSections?: NavSection[];
  user?: {
    name: string;
    role: string;
    initials: string;
    avatarUrl?: string | null;
    permissions?: any;
    agentId?: string;
  };
  title?: string;
  subtitle?: string;
  isMasterMode?: boolean;
  workspaceName?: string;
  workspaceSlug?: string;
  logoUrl?: string;
  clients?: { id: string; name: string }[];
  agents?: { id: string; name: string; clientId: string }[];
  galleries?: { id: string; title: string }[];
  isActionLocked?: boolean;
  brandColor?: string;
  navCounts?: {
    bookings?: number;
    galleries?: number;
    edits?: number;
  };
}

export function DashboardShell(props: DashboardShellProps) {
  return (
    <DashboardProvider>
      <Suspense fallback={null}>
        <ProgressBar />
      </Suspense>
      <Suspense fallback={null}>
        <NavigationIntentOverlay />
      </Suspense>
      <NavigationPrefetcher />
      <GuideProvider>
        <DashboardShellContent {...props} />
      </GuideProvider>
    </DashboardProvider>
  );
}

function DashboardShellContent({ 
  children, 
  navSections: providedNavSections, 
  user: providedUser,
  title: propTitle,
  subtitle: propSubtitle,
  isMasterMode = false,
  workspaceName,
  workspaceSlug,
  logoUrl,
  clients = [],
  agents = [],
  galleries = [],
  isActionLocked = false,
  brandColor,
  navCounts = {}
}: DashboardShellProps) {
  const { showHints, setShowHints } = useGuide();
  const { 
    activeModal, 
    setActiveModal, 
    isSidebarCollapsed, 
    setIsSidebarCollapsed,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    title: contextTitle,
    subtitle: contextSubtitle
  } = useDashboard();

  const title = propTitle || contextTitle;
  const subtitle = propSubtitle || contextSubtitle;

  const pathname = usePathname();
  const router = useRouter();
  const isCalendarV2FullWidth = pathname?.startsWith("/tenant/calendar");
  // Full-width layout rollout (now live): dashboard home + galleries.
  const isDashboardHomeFullWidth = pathname === "/";
  const isTenantGalleriesFullWidth = pathname?.startsWith("/tenant/galleries");
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [counts, setCounts] = useState<{ bookings?: number, galleries?: number, edits?: number }>(navCounts || {});
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
    "Operations": true,
    "Studio Setup": true
  });
  const pointerNavHrefRef = useRef<string | null>(null);
  const didFetchCountsRef = useRef(false);

  const toggleExpand = (label: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };

  const shouldHandlePointerNav = (e: ReactPointerEvent, href: string) => {
    // Only handle primary button/finger taps (avoid right-click, new-tab modifiers, etc.)
    // Also avoid hijacking non-internal links.
    if (e.button !== 0) return false;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    if (!href || href.startsWith("http")) return false;
    return true;
  };

  const handleNavPointerDown = (e: ReactPointerEvent, href: string) => {
    if (!shouldHandlePointerNav(e, href)) return;
    // Trigger nav on pointer-down so touch feels instant (click can come later).
    pointerNavHrefRef.current = href;
    setIsMobileMenuOpen(false);
    router.push(href);
  };

  const handleNavClick = (e: ReactMouseEvent, href: string) => {
    // If we already navigated on pointer-down, suppress the subsequent click navigation.
    if (pointerNavHrefRef.current === href) {
      e.preventDefault();
      // Clear on next tick so other links aren't affected.
      setTimeout(() => {
        if (pointerNavHrefRef.current === href) pointerNavHrefRef.current = null;
      }, 0);
      return;
    }
    setIsMobileMenuOpen(false);
  };

  // Fetch Spark Counts in background (defer so it doesn't compete with dashboard load)
  useEffect(() => {
    const fetchCounts = async () => {
      if (didFetchCountsRef.current) return;
      didFetchCountsRef.current = true;

      try {
        const res = await fetch("/api/nav/counts");
        if (res.ok) {
          const data = await res.json();
          setCounts(data);
        }
      } catch (err) {
        console.error("Failed to fetch spark counts:", err);
      }
    };

    const run = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

      const conn: any = typeof navigator !== "undefined" ? (navigator as any).connection : null;
      if (conn?.saveData) return;

      void fetchCounts();
    };

    const delayMs = 4000;
    let timeoutId: number | null = null;
    let idleId: number | null = null;

    timeoutId = window.setTimeout(() => {
      if (typeof (window as any).requestIdleCallback === "function") {
        idleId = (window as any).requestIdleCallback(run, { timeout: 1500 });
      } else {
        run();
      }
    }, delayMs);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (idleId && typeof (window as any).cancelIdleCallback === "function") {
        (window as any).cancelIdleCallback(idleId);
      }
    };
  }, []);

  // If the user opens the mobile menu, fetch counts immediately (better perceived responsiveness)
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    if (didFetchCountsRef.current) return;
    didFetchCountsRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/nav/counts");
        if (res.ok) setCounts(await res.json());
      } catch (err) {
        console.error("Failed to fetch spark counts:", err);
      }
    })();
  }, [isMobileMenuOpen]);

  // Dynamically apply brand color
  useEffect(() => {
    // Master mode uses a fixed, uniform green accent.
    const masterAccent = "#10b981";

    // If brandColor is white, empty, or missing, default to a safe Slate Gray (#94a3b8)
    const safeColor = isMasterMode
      ? masterAccent
      : (!brandColor || brandColor.toLowerCase() === "#ffffff" || brandColor.toLowerCase() === "white")
        ? "#94a3b8"
        : brandColor;

    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.style.setProperty("--primary", safeColor);
      root.style.setProperty("--primary-soft", `${safeColor}33`);
    }
  }, [brandColor, isMasterMode]);

  const [isSeeAllEnabled, setIsSeeAllEnabled] = useState(false);

  // Use provided user info or fall back to session
  const user = useMemo(() => {
    if (providedUser) return providedUser as any;
    // Fallback: keep it minimal to avoid pulling session client-side
    return {
      name: "User",
      role: "CLIENT",
      clientId: null,
      agentId: null,
      initials: "U",
      avatarUrl: null,
      permissions: {}
    };
  }, [providedUser]);

  const finalSlug = workspaceSlug;

  const showFinancials = useMemo(() => user.role === "TENANT_ADMIN" || user.role === "ADMIN" || user.role === "ACCOUNTS", [user.role]);
  const isRestrictedRole = useMemo(() => !showFinancials && user.role !== "CLIENT" && user.role !== "AGENT", [showFinancials, user.role]);

  const filteredNav = useMemo(() => {
    if (providedNavSections) return providedNavSections;
    
    return permissionService.getFilteredNav(
      { 
        role: user.role as any, 
        isMasterMode, 
        permissions: user.permissions
      },
      UNIFIED_NAV_CONFIG
    );
  }, [user.role, user.permissions, isMasterMode, providedNavSections]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    signOut({ callbackUrl: "/login" });
  };

  const sidebarContent = useMemo(() => {
    return filteredNav.map((section: any, idx: number) => (
      <div key={section.heading || idx} className="flex flex-col gap-3">
        {section.heading && !isSidebarCollapsed && (
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 animate-in fade-in">
            {section.heading}
          </p>
        )}
        <div className="flex flex-col gap-1">
          {section.items.map((item: any) => {
            const Icon = IconMap[item.icon] || HelpCircle;
            const hasSubItems = item.items && item.items.length > 0;
            const isExpanded = expandedItems[item.label];
            const isActive = pathname === item.href || (hasSubItems && item.items.some((sub: any) => pathname === sub.href));
            
            // Calculate total count for parent if it has sub-items
            const totalSubCount = hasSubItems 
              ? item.items.reduce((acc: number, sub: any) => acc + (counts[sub.module as keyof typeof counts] || 0), 0)
              : 0;
            const count = hasSubItems ? totalSubCount : counts[item.module as keyof typeof counts];
            
            if (hasSubItems && !isSidebarCollapsed) {
              return (
                <div key={item.label} className="flex flex-col gap-1">
                  <button
                    onClick={() => toggleExpand(item.label)}
                    className={cn(
                      "group flex items-center justify-between rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200",
                      isActive && !isExpanded
                        ? "bg-primary text-white shadow-lg" 
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span className={cn(
                        "flex h-8 w-8 flex-none items-center justify-center rounded-full transition-colors relative",
                        isActive && !isExpanded ? "bg-white/20 text-white" : "bg-slate-50 group-hover:bg-primary group-hover:text-white"
                      )}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="animate-in fade-in">{item.label}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {totalSubCount > 0 && !isExpanded && (
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white shadow-sm ring-2 ring-white animate-in zoom-in">
                          {totalSubCount}
                        </span>
                      )}
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                  </button>
                  
                  {isExpanded && (
                    <div className="ml-4 pl-4 border-l border-slate-100 flex flex-col gap-1 animate-in slide-in-from-top-2 duration-200">
                      {item.items.map((sub: any) => {
                        const isSubActive = pathname === sub.href;
                        const subCount = counts[sub.module as keyof typeof counts];
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            prefetch={false}
                            onPointerDown={(e) => handleNavPointerDown(e, sub.href)}
                            onClick={(e) => handleNavClick(e, sub.href)}
                            className={cn(
                              "flex items-center justify-between px-3 py-2 rounded-lg text-[12px] font-medium transition-colors group active:scale-[0.99]",
                              isSubActive 
                                ? "text-primary bg-primary/5" 
                                : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                            )}
                          >
                            <span>{sub.label}</span>
                            {subCount && subCount > 0 && (
                              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-sm ring-1 ring-white animate-in zoom-in">
                                {subCount}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Hint 
                key={item.href} 
                title={item.label} 
                content={`Navigate to ${item.label}`}
                position="right"
              >
                <Link
                  href={item.href}
                  prefetch={false}
                  onPointerDown={(e) => handleNavPointerDown(e, item.href)}
                  onClick={(e) => handleNavClick(e, item.href)}
                  className={cn(
                    "group flex items-center rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200 active:scale-[0.99]",
                    isActive 
                      ? "bg-primary text-white shadow-lg" 
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                    isSidebarCollapsed ? "lg:justify-center lg:px-0 lg:w-12 lg:h-12 lg:mx-auto" : "justify-between"
                  )}
                  style={isActive ? { boxShadow: `0 10px 15px -3px var(--primary-soft)` } : {}}
                >
                  <span className={cn("flex items-center gap-3", isSidebarCollapsed && "lg:gap-0")}>
                    <span className={cn(
                      "flex h-8 w-8 flex-none items-center justify-center rounded-full transition-colors relative",
                      isActive ? "bg-white/20 text-white" : "bg-slate-50 group-hover:bg-primary group-hover:text-white"
                    )}>
                      <Icon className="h-4 w-4" />
                      {isSidebarCollapsed && count && count > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white animate-in zoom-in">
                          {count > 9 ? '9+' : count}
                        </span>
                      )}
                    </span>
                    {!isSidebarCollapsed && <span className="animate-in fade-in">{item.label}</span>}
                  </span>
                  {!isSidebarCollapsed && count && count > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white shadow-sm ring-2 ring-white animate-in zoom-in">
                      {count}
                    </span>
                  )}
                </Link>
              </Hint>
            );
          })}
        </div>
      </div>
    ));
  }, [filteredNav, isSidebarCollapsed, pathname, counts, setIsMobileMenuOpen, expandedItems]);

  const memoizedChildren = useMemo(() => children, [children]);

  return (
    <div className="flex min-h-screen bg-slate-50 overflow-x-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Lazy-loaded Quick Action Modals */}
      <QuickActionModals 
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        clients={clients}
        agents={agents}
        galleries={galleries}
      />

      {/* Sidebar */}
      <aside 
        onMouseEnter={() => setIsSidebarCollapsed(false)}
        onMouseLeave={() => setIsSidebarCollapsed(true)}
        className={cn(
          "fixed inset-y-0 left-0 border-r border-slate-200 bg-white flex flex-col z-50 transition-all duration-300 ease-in-out",
          isMobileMenuOpen ? "translate-x-0 w-72" : "-translate-x-full lg:translate-x-0",
          isSidebarCollapsed ? "lg:w-24" : "lg:w-72"
        )}
      >
        {/* Version Badge - Absolute to Sidebar */}
        <div className="absolute top-2 left-6 z-[60] pointer-events-none">
          <span className="text-[9px] font-black text-rose-500 uppercase tracking-[0.2em] opacity-80">
            v{APP_VERSION}
          </span>
        </div>

        {/* Brand */}
        <div className={cn(
          "mb-10 flex items-center gap-3 px-6 pt-8 transition-all duration-300 relative",
          isSidebarCollapsed && "lg:px-4 lg:justify-center lg:gap-0"
        )}>
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-primary text-white shadow-lg overflow-hidden group-hover:scale-105 transition-transform relative"
               style={{ 
                 boxShadow: isMasterMode ? `0 10px 15px -3px rgba(16, 185, 129, 0.35)` : `0 10px 15px -3px var(--primary-soft)`,
                 background: isMasterMode ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : undefined
               }}>
            {logoUrl && logoUrl !== "" ? (
              <Image 
                src={formatDropboxUrl(logoUrl)} 
                className="h-full w-full object-contain p-1" 
                alt={workspaceName || "Brand"} 
                fill
                sizes="44px"
              />
            ) : (
              <span className="text-xl font-black italic">
                {isMasterMode ? "M" : (workspaceName || "St")[0]}
                {isMasterMode ? "A" : (workspaceName || "St")[1]}
              </span>
            )}
          </div>
          {!isSidebarCollapsed && (
            <div className="min-w-0 transition-opacity duration-300 animate-in fade-in">
              <p className="text-sm font-bold text-slate-900 leading-tight truncate">
                {isMasterMode ? "Studiio Master" : workspaceName || "Studiio Tenant"}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                {isMasterMode ? "Master Control" : (user.role === "AGENT" || user.role === "CLIENT") ? `${user.role} ACCESS` : isRestrictedRole ? "EDITOR ACCESS" : "Operations Control"}
              </p>
            </div>
          )}
        </div>

        <nav className="flex-1 flex flex-col gap-10 overflow-y-auto px-6 pr-2 scrollbar-hide">
          {sidebarContent}
        </nav>

        {/* Sidebar Footer */}
        <div className="mt-auto space-y-6 pt-6 px-6 pb-8">
          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-100 bg-slate-50/50 mb-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Guide Mode</span>
            <button 
              onClick={() => setShowHints(!showHints)}
              className={cn(
                "h-5 w-9 rounded-full transition-colors relative",
                showHints ? "bg-primary" : "bg-slate-200"
              )}
            >
              <div className={cn(
                "absolute top-1 left-1 h-3 w-3 bg-white rounded-full transition-transform",
                showHints ? "translate-x-4" : "translate-x-0"
              )} />
            </button>
          </div>

          <button 
            onClick={handleLogout}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all active:scale-[0.98] group shadow-sm",
              isSidebarCollapsed && "lg:justify-center lg:px-0 lg:w-12 lg:h-12 lg:mx-auto"
            )}
          >
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-rose-50 text-rose-500 group-hover:bg-rose-500 group-hover:text-white transition-colors">
              <LogOut className="h-4 w-4" />
            </span>
            {!isSidebarCollapsed && <span className="text-sm font-bold text-slate-700 animate-in fade-in">Logout</span>}
          </button>

          {/* Desktop Collapse Toggle */}
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden lg:flex w-10 h-10 items-center justify-center rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition-all mx-auto text-slate-400 hover:text-slate-600"
          >
            {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex-1 min-h-screen transition-all duration-300 ease-in-out flex flex-col min-w-0",
        isSidebarCollapsed ? "lg:ml-24" : "lg:ml-72"
      )}>
        <header className="sticky top-0 z-30 bg-white/80 border-b border-slate-200 px-4 md:px-10 py-4 md:py-6 backdrop-blur-md w-full">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4 md:gap-8 w-full">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              {/* Mobile Hamburger */}
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-4">
                  <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight truncate">{title}</h1>
                  <div className="hidden md:flex items-center gap-4">
                    {user.role === "AGENT" && user.permissions?.seeAll && (
                      <div className="flex items-center gap-3 px-4 py-1.5 rounded-full bg-slate-50 border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">See All Agency Data</span>
                        <button 
                          onClick={() => {
                            setIsSeeAllEnabled(!isSeeAllEnabled);
                            window.dispatchEvent(new CustomEvent('toggle-see-all', { detail: !isSeeAllEnabled }));
                          }}
                          className={cn(
                            "w-10 h-5 rounded-full transition-colors relative",
                            isSeeAllEnabled ? "bg-emerald-500" : "bg-slate-300"
                          )}
                        >
                          <div className={cn(
                            "absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform",
                            isSeeAllEnabled ? "translate-x-5" : "translate-x-0"
                          )} />
                        </button>
                      </div>
                    )}
                    {user.role === "AGENT" && !user.permissions?.seeAll && (
                      <div className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Welcome: {user.name}
                      </div>
                    )}
                    {user.role === "CLIENT" && (
                      <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary uppercase tracking-wider">
                        Client Portal
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs md:text-sm font-medium text-slate-500 mt-0.5 md:mt-1 truncate">{subtitle}</p>
              </div>
            </div>

            {/* Quick Add Button - Center removed as per request */}
            <div className="hidden lg:flex items-center justify-center px-4" />
            
                    <div className="flex items-center gap-3 md:gap-6 flex-shrink-0">
                      {user.role === "TENANT_ADMIN" && !isMasterMode && (
                        <SetupChecklist />
                      )}
                      
                      {finalSlug && user.role !== "CLIENT" && user.role !== "AGENT" && user.role !== "EDITOR" && (
                        <Hint title="Public Booking Link" content="Copy your unique booking URL to share with new clients." position="bottom">
                          <button 
                            onClick={() => {
                              const url = `${window.location.origin}/book/${finalSlug}`;
                              navigator.clipboard.writeText(url);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            }}
                            className={cn(
                              "h-10 px-4 rounded-xl border border-slate-200 bg-white flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all hover:border-primary group active:scale-95",
                              copied && "border-emerald-500 bg-emerald-50"
                            )}
                          >
                            {copied ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                                <span className="text-emerald-600">Copied!</span>
                              </>
                            ) : (
                              <>
                                <LinkIcon className="h-3.5 w-3.5 text-slate-400 group-hover:text-primary transition-colors" />
                                <span className="text-slate-600 group-hover:text-slate-900">Booking Link</span>
                              </>
                            )}
                          </button>
                        </Hint>
                      )}

                      <Hint title="Global Search" content="Instantly find bookings, galleries, or clients across your entire studio." position="bottom">
                <div className="hidden sm:block">
                  <GlobalSearch 
                    placeholder={isRestrictedRole ? "Search edits..." : "Search..."}
                  />
                </div>
              </Hint>
              
                          <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-slate-900 flex items-center justify-center text-[11px] md:text-[13px] font-bold text-white shadow-lg shadow-slate-900/20 ring-2 ring-white overflow-hidden relative">
                            {user?.avatarUrl && user.avatarUrl !== "" ? (
                              <Image 
                                src={formatDropboxUrl(user.avatarUrl)} 
                                className="h-full w-full object-cover" 
                                alt={user.name} 
                                fill
                                sizes="40px"
                              />
                            ) : (
                              user?.initials || "U"
                            )}
                          </div>
            </div>
          </div>
          {/* Mobile Search - Visible only on very small screens */}
          <div className="mt-4 sm:hidden">
            <GlobalSearch 
              placeholder={isRestrictedRole ? "Search edits..." : "Search..."}
            />
          </div>
        </header>

        <div
          className={cn(
            "py-6 md:py-10 w-full overflow-x-hidden",
            isCalendarV2FullWidth
              ? "px-0 max-w-none mx-0"
              : (isDashboardHomeFullWidth || isTenantGalleriesFullWidth)
                ? "px-3 md:px-6 max-w-none mx-0"
                : "px-4 md:px-10 max-w-[1600px] mx-auto"
          )}
        >
          {memoizedChildren}
        </div>

        {user.role === "TENANT_ADMIN" && !isMasterMode && (
          <OnboardingWizard />
        )}
      </main>
    </div>
  );
}
