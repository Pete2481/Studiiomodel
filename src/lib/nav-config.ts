import { LucideIcon } from "lucide-react";

export type Module = 
  | "dashboard"
  | "reports"
  | "tenants"
  | "bookings"
  | "galleries"
  | "edits"
  | "clients"
  | "invoices"
  | "services"
  | "team"
  | "reminders"
  | "newsletter"
  | "agents"
  | "settings";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  module: Module;
  items?: { label: string; href: string; module: Module }[];
}

export interface NavSection {
  heading?: string;
  items: NavItem[];
}

export const UNIFIED_NAV_CONFIG: NavSection[] = [
  // 1. Overview
  {
    items: [
      { label: "Dashboard", href: "/", icon: "LayoutDashboard", module: "dashboard" },
      { label: "Reports", href: "/tenant/reports", icon: "ChartColumn", module: "reports" },
    ],
  },

  // 2. Operations
  {
    heading: "Work",
    items: [
      { 
        label: "Operations", 
        href: "/tenant/calendar", 
        icon: "Activity", 
        module: "bookings",
        items: [
          { label: "Calendar", href: "/tenant/calendar", module: "bookings" },
          { label: "Bookings", href: "/tenant/bookings", module: "bookings" },
          { label: "Galleries", href: "/tenant/galleries", module: "galleries" },
          { label: "Edit requests", href: "/tenant/edits", module: "edits" },
        ]
      },
    ],
  },

  // 3. Relationships
  {
    heading: "People",
    items: [
      { 
        label: "Clients", 
        href: "/tenant/clients", 
        icon: "Users", 
        module: "clients",
        items: [
          { label: "Client Agencies", href: "/tenant/clients", module: "clients" },
          { label: "Client Members", href: "/tenant/agents", module: "agents" },
        ]
      },
      { label: "Studio Crew", href: "/tenant/photographers", icon: "Camera", module: "team" },
    ],
  },

  // 4. Studio Setup
  {
    heading: "Studio Setup",
    items: [
      { label: "Invoices", href: "/tenant/invoices", icon: "Receipt", module: "invoices" },
      { label: "Services", href: "/tenant/services", icon: "Wrench", module: "services" },
    ],
  },

  // 5. Config
  {
    heading: "Config",
    items: [
      { label: "Reminders", href: "/tenant/reminders", icon: "Bell", module: "reminders" },
      { label: "Newsletter", href: "/tenant/newsletter", icon: "Newspaper", module: "newsletter" },
      { label: "Settings", href: "/tenant/settings", icon: "Settings", module: "settings" },
    ],
  },

  // 6. Master Admin Specific Sections
  {
    heading: "MASTER CONTROL",
    items: [
      { label: "Master Dashboard", href: "/master", icon: "LayoutDashboard", module: "dashboard" },
      { label: "All Studios", href: "/master/tenants", icon: "Building2", module: "tenants" },
      { label: "Network Analytics", href: "/master/reports", icon: "TrendingUp", module: "dashboard" },
      { label: "New Studio", href: "/master/tenants/new", icon: "Plus", module: "tenants" },
    ],
  },

  // 7. Platform-Wide View (Master Admin Only)
  {
    heading: "PLATFORM WIDE",
    items: [
      { label: "Global Calendar", href: "/tenant/calendar?global=true", icon: "Calendar", module: "bookings" },
      { label: "Global Bookings", href: "/tenant/bookings?global=true", icon: "Calendar", module: "bookings" },
      { label: "Global Galleries", href: "/tenant/galleries?global=true", icon: "Image", module: "galleries" },
      { label: "Global Edits", href: "/tenant/edits?global=true", icon: "Paintbrush", module: "edits" },
    ],
  },
];
