"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  X, 
  ChevronRight,
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
  HelpCircle,
  LogOut
} from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { permissionService } from "@/lib/permission-service";
import { cn } from "@/lib/utils";

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

interface MobileMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileMenuDrawer({ isOpen, onClose }: MobileMenuDrawerProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  
  const user = {
    name: session?.user?.name || "User",
    role: (session?.user as any)?.role || "CLIENT",
    permissions: (session?.user as any)?.permissions || {}
  };

  const filteredNav = permissionService.getFilteredNav(
    { 
      role: user.role as any, 
      isMasterMode: user.role === "MASTER_ADMIN", 
      permissions: user.permissions
    },
    UNIFIED_NAV_CONFIG
  );

  const isStaff = user.role === "TENANT_ADMIN" || user.role === "ADMIN" || user.role === "EDITOR" || user.role === "TEAM_MEMBER";
  const isMaster = user.role === "MASTER_ADMIN";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] transition-all duration-500">
      {/* Backdrop */}
      <div 
        className={cn(
          "absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-500",
          isOpen ? "opacity-100" : "opacity-0"
        )} 
        onClick={onClose} 
      />
      
      {/* Drawer */}
      <div 
        className={cn(
          "absolute bottom-0 left-0 right-0 bg-white rounded-t-[40px] shadow-2xl transition-transform duration-500 ease-out flex flex-col max-h-[90vh] overflow-hidden",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto my-6 shrink-0" />
        
        <div className="px-8 pb-6 flex items-start justify-between shrink-0 border-b border-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200">
              {session?.user?.image ? (
                <img src={session.user.image} className="h-full w-full object-cover" alt="Profile" />
              ) : (
                <span className="text-xl font-black text-slate-300">
                  {session?.user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 leading-tight">
                {session?.user?.name || "User"}
              </h2>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-1 italic">
                {isMaster ? "Grand Master" : isStaff ? "Production Staff" : "Client Portal"}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90 transition-all mt-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-12">
          <div className="space-y-8 mt-8">
            {(isStaff || isMaster) && filteredNav.map((section: any, idx: number) => {
              // Filtering items based on role
              const mobileOnlyItems = section.items.filter((item: any) => {
                if (isMaster) {
                  // For Grand Master, only show Platform-wide and Master Control sections
                  return section.heading === "MASTER CONTROL" || section.heading === "PLATFORM WIDE";
                }
                
                // For regular staff, show their usual mobile routes
                const mobileRoutes = [
                  "/", 
                  "/tenant/clients", 
                  "/tenant/services", 
                  "/tenant/photographers", 
                  "/tenant/reports", 
                  "/tenant/invoices",
                  "/tenant/bookings",
                  "/tenant/calendar",
                  "/tenant/edits",
                  "/tenant/settings"
                ];
                return mobileRoutes.includes(item.href);
              });

              if (mobileOnlyItems.length === 0) return null;

              return (
                <div key={section.heading || idx} className="space-y-4">
                  {section.heading && (
                    <p className="px-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                      {section.heading}
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2">
                    {mobileOnlyItems.map((item: any) => {
                      const Icon = IconMap[item.icon] || HelpCircle;
                      
                      // Route mapping
                      let href = item.href;
                      if (href === "/") href = "/mobile";
                      else if (href === "/master") href = "/mobile/master";
                      else if (href === "/master/tenants") href = "/mobile/master/tenants";
                      else if (href.startsWith("/tenant/")) {
                        href = href.replace("/tenant/", "/mobile/");
                      }

                      // Special case for global flags
                      const finalHref = item.href.includes("?global=true") 
                        ? href.split('?')[0] + "?global=true"
                        : href;

                      const isActive = pathname === finalHref;
                      
                      return (
                        <Link
                          key={finalHref}
                          href={finalHref}
                          onClick={onClose}
                          className={cn(
                            "group flex items-center justify-between rounded-[24px] p-4 transition-all duration-200 active:scale-[0.98]",
                            isActive 
                              ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
                              : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                          )}
                        >
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
                              isActive ? "bg-white/20" : "bg-white shadow-sm text-slate-400"
                            )}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <span className="text-sm font-bold uppercase tracking-tight italic">{item.label}</span>
                          </div>
                          <ChevronRight className={cn("h-4 w-4", isActive ? "text-white/60" : "text-slate-300")} />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Logout Option - Always visible, but more prominent if it's the only option */}
            <button
              onClick={() => {
                onClose();
                signOut({ callbackUrl: "/login" });
              }}
              className={cn(
                "w-full flex items-center justify-between rounded-[24px] p-4 transition-all active:scale-[0.98]",
                !isStaff ? "bg-slate-900 text-white shadow-xl" : "bg-rose-50 text-rose-600 mt-4"
              )}
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center",
                  !isStaff ? "bg-white/10" : "bg-white shadow-sm"
                )}>
                  <LogOut className="h-5 w-5" />
                </div>
                <span className="text-sm font-bold">Sign Out</span>
              </div>
              <ChevronRight className={cn("h-4 w-4", !isStaff ? "text-white/40" : "text-rose-200")} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

