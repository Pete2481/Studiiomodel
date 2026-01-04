"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, 
  Calendar, 
  Bell,
  Search,
  Clock,
  LayoutGrid,
  Menu,
  Building2,
  ImageIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileMenu } from "./mobile-menu-context";
import { useSession } from "next-auth/react";
import { ShieldCheck } from "lucide-react";

export function AppBottomNav() {
  const pathname = usePathname();
  const { openMenu } = useMobileMenu();
  const { data: session } = useSession();
  const isMasterAdmin = (session?.user as any)?.isMasterAdmin;

  const navItems = isMasterAdmin ? [
    {
      label: "Home",
      icon: LayoutGrid,
      href: "/mobile/master",
    },
    {
      label: "Studios",
      icon: Building2,
      href: "/mobile/master/tenants",
    },
    {
      label: "Assets",
      icon: ImageIcon,
      href: "/mobile/galleries?global=true",
    },
    {
      label: "Inbox",
      icon: Bell,
      href: "/mobile/inbox",
    },
    {
      label: "Menu",
      icon: Menu,
      href: "#",
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        openMenu();
      }
    },
  ] : [
    {
      label: "Home",
      icon: LayoutGrid,
      href: "/mobile",
    },
    {
      label: "Schedule",
      icon: Clock,
      href: "/mobile/bookings",
    },
    {
      label: "Calendar",
      icon: Calendar,
      href: "/mobile/calendar",
    },
    {
      label: "Inbox",
      icon: Bell,
      href: "/mobile/inbox",
    },
    {
      label: "Menu",
      icon: Menu,
      href: "#",
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        openMenu();
      }
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t border-slate-100 pb-safe">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          
          const content = (
            <>
              <Icon className={cn(
                "h-6 w-6 transition-all duration-300",
                isActive ? "fill-primary text-primary" : ""
              )} />
              <span className="text-[10px] font-bold uppercase tracking-widest mt-1">
                {item.label}
              </span>
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-b-full animate-in fade-in slide-in-from-top-1 duration-300" />
              )}
            </>
          );

          if (item.onClick) {
            return (
              <button
                key={item.label}
                onClick={item.onClick}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full transition-all duration-300 relative",
                  "text-slate-400 active:scale-95"
                )}
              >
                {content}
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full transition-all duration-300 relative",
                isActive ? "text-primary scale-110" : "text-slate-400"
              )}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

