"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ReactNode, useState, useEffect, useMemo } from "react";
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
  Link as LinkIcon,
  Copy,
  Check
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { upsertGallery } from "@/app/actions/gallery";
import { upsertBooking } from "@/app/actions/booking-upsert";
import { upsertClient } from "@/app/actions/client";
import { upsertService } from "@/app/actions/service";
import { createEditRequest } from "@/app/actions/edit-request";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { DashboardProvider, useDashboard } from "./dashboard-context";
import { GlobalSearch } from "./global-search";
import { GuideProvider, useGuide } from "./guide-context";
import { Hint } from "@/components/ui";

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
  ChartColumn
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
  title = "Operations Control",
  subtitle = "Monitor and manage your photography workflow.",
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
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickActionAddress, setQuickActionAddress] = useState("");

  // Dynamically apply brand color
  useEffect(() => {
    if (brandColor && typeof document !== "undefined") {
      const root = document.documentElement;
      root.style.setProperty("--primary", brandColor);
      root.style.setProperty("--primary-soft", `${brandColor}33`);
    }
  }, [brandColor]);

  const { 
    activeModal, 
    setActiveModal, 
    isSidebarCollapsed, 
    setIsSidebarCollapsed,
    isMobileMenuOpen,
    setIsMobileMenuOpen
  } = useDashboard();

  const [isSeeAllEnabled, setIsSeeAllEnabled] = useState(false);

  // Reset address when modal changes
  useEffect(() => {
    if (!activeModal) setQuickActionAddress("");
  }, [activeModal]);

  // Use provided user info or fall back to session
  const user = useMemo(() => providedUser || {
    name: session?.user?.name || "User",
    role: (session?.user as any)?.role || "CLIENT",
    clientId: (session?.user as any)?.clientId || null,
    agentId: (session?.user as any)?.agentId || null,
    initials: session?.user?.name?.split(' ').map(n => n[0]).join('') || "U",
    avatarUrl: session?.user?.image || null,
    permissions: (session?.user as any)?.permissions || {}
  }, [providedUser, session]);

  const finalSlug = workspaceSlug || (session?.user as any)?.tenantSlug;

  const showFinancials = user.role === "TENANT_ADMIN" || user.role === "ADMIN" || user.role === "ACCOUNTS";
  const isRestrictedRole = !showFinancials && user.role !== "CLIENT" && user.role !== "AGENT";

  useEffect(() => {
    // Only show "See All" if the agent has the permission
    if (user.role === "AGENT" && user.permissions?.seeAll) {
      // In a real app, you might sync this with localStorage or a user setting
    }
  }, [user.role, user.permissions?.seeAll]);

  // Use provided nav or fall back to global config
  const baseNav = providedNavSections || UNIFIED_NAV_CONFIG;

  const filteredNav = useMemo(() => {
    return permissionService.getFilteredNav(
      { 
        role: user.role as any, 
        isMasterMode, 
        permissions: user.permissions
      },
      baseNav
    );
  }, [user.role, user.permissions, isMasterMode, baseNav]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    signOut({ callbackUrl: "/login" });
  };

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);

    try {
      if (activeModal === "gallery") {
        await upsertGallery({
          title: formData.get("title") as string,
          clientId: formData.get("clientId") as string,
          agentId: formData.get("agentId") as string,
          status: (formData.get("status") as string) || "DRAFT"
        });
      } else if (activeModal === "appointment") {
        await upsertBooking({
          title: formData.get("title"),
          clientId: formData.get("clientId"),
          address: formData.get("address"),
          startAt: formData.get("date") ? `${formData.get("date")}T09:00:00` : new Date().toISOString(),
          status: "PENCILLED"
        });
      } else if (activeModal === "client") {
        await upsertClient({
          name: formData.get("name"),
          businessName: formData.get("businessName"),
          email: formData.get("email"),
          status: "PENDING"
        });
      } else if (activeModal === "service") {
        await upsertService({
          name: formData.get("name") as string,
          description: formData.get("description") as string,
          price: formData.get("price") as string,
          durationMinutes: formData.get("duration") as string,
        });
      } else if (activeModal === "edit") {
        await createEditRequest({
          galleryId: formData.get("galleryId") as string,
          note: formData.get("note") as string,
          tagIds: [], // Tags handled differently in production
          fileUrl: "TBD", // Requires upload flow
        });
      }
      setActiveModal(null);
    } catch (error) {
      console.error("Action failed:", error);
      alert("Failed to create. Please check the details.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50 overflow-x-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Modal Backdrop */}
      {activeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-6">
          <div className="bg-white w-full max-w-xl rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900 capitalize">
                  {activeModal === "gallery" && "Add New Gallery"}
                  {activeModal === "appointment" && "New Appointment"}
                  {activeModal === "invoice" && "Generate Invoice"}
                  {activeModal === "client" && "Invite New Client"}
                  {activeModal === "service" && "Add New Service"}
                  {activeModal === "edit" && "New Edit Request"}
                </h3>
                <p className="text-sm font-medium text-slate-500">Complete the details below.</p>
              </div>
              <button 
                onClick={() => setActiveModal(null)}
                className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors text-slate-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit} className="p-8">
              <div className="space-y-6">
                {activeModal === "edit" ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Select Gallery</label>
                      <select name="galleryId" required className="ui-input appearance-none bg-white">
                        <option value="">Choose gallery...</option>
                        {galleries.map(g => (
                          <option key={g.id} value={g.id}>{g.title}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Instructions</label>
                      <textarea name="note" required placeholder="What needs editing?" className="ui-input h-32 py-4 resize-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Tags (Comma separated)</label>
                      <input name="tags" type="text" placeholder="Sky Replacement, Color Correction" className="ui-input" />
                    </div>
                  </>
                ) : activeModal === "service" ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Service Name</label>
                      <input name="name" required type="text" placeholder="Standard Shoot" className="ui-input" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Description</label>
                      <textarea name="description" placeholder="Describe the service..." className="ui-input h-24 py-4 resize-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Price ($)</label>
                        <input name="price" required type="number" step="0.01" placeholder="250" className="ui-input" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Duration (mins)</label>
                        <input name="duration" required type="number" placeholder="60" className="ui-input" />
                      </div>
                    </div>
                  </>
                ) : activeModal === "client" ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Full Name</label>
                      <input name="name" required type="text" placeholder="John Doe" className="ui-input" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Agency / Business Name</label>
                      <input name="businessName" required type="text" placeholder="Ray White" className="ui-input" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Email Address</label>
                      <input name="email" required type="email" placeholder="john@agency.com" className="ui-input" />
                    </div>
                  </>
                ) : activeModal === "gallery" ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Gallery Title / Address</label>
                      <input name="title" required type="text" placeholder="e.g. 4/17 Mahogany Drive, Byron Bay" className="ui-input" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Primary Client</label>
                        <select name="clientId" required className="ui-input appearance-none bg-white">
                          <option value="">Select client...</option>
                          {clients.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Lead Agent</label>
                        <select name="agentId" className="ui-input appearance-none bg-white">
                          <option value="">Select agent (Optional)</option>
                          {agents.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Initial Status</label>
                      <select name="status" className="ui-input appearance-none bg-white">
                        <option value="DRAFT">DRAFT (Hidden)</option>
                        <option value="READY">READY (Live)</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Subject / Title</label>
                      <input name="title" required type="text" placeholder="Enter name..." className="ui-input" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Primary Client</label>
                        <select name="clientId" required className="ui-input appearance-none bg-white">
                          <option value="">Select client...</option>
                          {clients.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Property Address</label>
                        <AddressAutocomplete 
                          name="address"
                          required
                          value={quickActionAddress}
                          onChange={setQuickActionAddress}
                          placeholder="Search address..." 
                          className="ui-input" 
                        />
                      </div>
                    </div>

                    {activeModal === "appointment" && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Shoot Date</label>
                        <input name="date" required type="date" className="ui-input" />
                      </div>
                    )}
                  </>
                )}
                
                <div className="pt-4 flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={() => setActiveModal(null)}
                    disabled={isSubmitting}
                    className="flex-1 h-12 rounded-full border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 h-12 rounded-full bg-[var(--primary)] text-white font-bold shadow-lg transition-all disabled:opacity-50"
                    style={{ boxShadow: `0 10px 15px -3px var(--primary-soft)` }}
                  >
                    {isSubmitting ? "Creating..." : `Create ${activeModal === 'appointment' ? 'Appointment' : activeModal === 'edit' ? 'Request' : activeModal}`}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

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
        {/* Brand */}
        <div className={cn(
          "mb-10 flex items-center gap-3 px-6 pt-8 transition-all duration-300",
          isSidebarCollapsed && "lg:px-4 lg:justify-center lg:gap-0"
        )}>
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-[var(--primary)] text-white shadow-lg overflow-hidden group-hover:scale-105 transition-transform"
               style={{ 
                 boxShadow: isMasterMode ? `0 10px 15px -3px rgba(99, 102, 241, 0.3)` : `0 10px 15px -3px var(--primary-soft)`,
                 background: isMasterMode ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' : undefined
               }}>
            {logoUrl && logoUrl !== "" ? (
              <img src={logoUrl} className="h-full w-full object-cover" alt={workspaceName || "Brand"} />
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
          {filteredNav.map((section: any, idx: number) => (
            <div key={section.heading || idx} className="flex flex-col gap-3">
              {section.heading && !isSidebarCollapsed && (
                <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 animate-in fade-in">
                  {section.heading}
                </p>
              )}
              <div className="flex flex-col gap-1">
                {section.items.map((item: any) => {
                  const Icon = IconMap[item.icon] || HelpCircle;
                  const isActive = pathname === item.href;
                  const count = navCounts[item.module as keyof typeof navCounts];
                  
                    return (
                      <Hint 
                        key={item.href} 
                        title={item.label} 
                        content={`Navigate to ${item.label}`}
                        position="right"
                      >
                        <Link
                          href={item.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={cn(
                            "group flex items-center rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200",
                            isActive 
                              ? "bg-[var(--primary)] text-white shadow-lg" 
                              : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                            isSidebarCollapsed ? "lg:justify-center lg:px-0 lg:w-12 lg:h-12 lg:mx-auto" : "justify-between"
                          )}
                          style={isActive ? { boxShadow: `0 10px 15px -3px var(--primary-soft)` } : {}}
                        >
                          <span className={cn("flex items-center gap-3", isSidebarCollapsed && "lg:gap-0")}>
                            <span className={cn(
                              "flex h-8 w-8 flex-none items-center justify-center rounded-full transition-colors relative",
                              isActive ? "bg-white/20 text-white" : "bg-slate-50 group-hover:bg-[var(--primary)] group-hover:text-white"
                            )}>
                              <Icon className="h-4 w-4" />
                              {isSidebarCollapsed && count && count > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white">
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
          ))}
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

          {!isSidebarCollapsed && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2 animate-in fade-in">
              <p className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">Quick tips</p>
              <p className="text-[11px] font-medium text-slate-400 leading-relaxed">
                {isRestrictedRole 
                  ? "Switch a job to 'In Progress' when you start editing. Mark it 'Completed' to notify the lead agent."
                  : "Drag & drop bookings into the calendar to reschedule instantly. Notify clients with one tap."
                }
              </p>
            </div>
          )}

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
        "flex-1 min-h-screen transition-all duration-300 ease-in-out",
        isSidebarCollapsed ? "lg:ml-24" : "lg:ml-72"
      )}>
        <header className="sticky top-0 z-30 bg-white/80 border-b border-slate-200 px-4 md:px-10 py-4 md:py-6 backdrop-blur-md">
          <div className="flex items-center justify-between gap-4 md:gap-8">
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
              
                          <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-slate-900 flex items-center justify-center text-[11px] md:text-[13px] font-bold text-white shadow-lg shadow-slate-900/20 ring-2 ring-white overflow-hidden">
                            {user?.avatarUrl && user.avatarUrl !== "" ? (
                              <img src={user.avatarUrl} className="h-full w-full object-cover" alt={user.name} />
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

        <div className="px-4 md:px-10 py-6 md:py-10 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
