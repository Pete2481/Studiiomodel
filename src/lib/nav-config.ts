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
}

export interface NavSection {
  heading?: string;
  items: NavItem[];
}

export const UNIFIED_NAV_CONFIG: NavSection[] = [
  // 1. Root Section (Always visible modules based on permission)
  {
    items: [
      { label: "Dashboard", href: "/", icon: "LayoutDashboard", module: "dashboard" },
      { label: "Calendar", href: "/tenant/calendar", icon: "Calendar", module: "bookings" },
      { label: "Bookings", href: "/tenant/bookings", icon: "Calendar", module: "bookings" },
      { label: "Galleries", href: "/tenant/galleries", icon: "Image", module: "galleries" },
      { label: "Edit requests", href: "/tenant/edits", icon: "Paintbrush", module: "edits" },
    ],
  },

  // 2. Master Admin Specific Sections
  {
    heading: "MASTER CONTROL",
    items: [
      { label: "Master Dashboard", href: "/master", icon: "LayoutDashboard", module: "dashboard" },
      { label: "All Studios", href: "/master/tenants", icon: "Building2", module: "tenants" },
      { label: "Network Analytics", href: "/master/reports", icon: "TrendingUp", module: "dashboard" },
      { label: "New Studio", href: "/master/tenants/new", icon: "Plus", module: "tenants" },
    ],
  },

  // 3. Platform-Wide View (Master Admin Only)
  {
    heading: "PLATFORM WIDE",
    items: [
      { label: "Global Calendar", href: "/tenant/calendar?global=true", icon: "Calendar", module: "bookings" },
      { label: "Global Bookings", href: "/tenant/bookings?global=true", icon: "Calendar", module: "bookings" },
      { label: "Global Galleries", href: "/tenant/galleries?global=true", icon: "Image", module: "galleries" },
      { label: "Global Edits", href: "/tenant/edits?global=true", icon: "Paintbrush", module: "edits" },
    ],
  },
  
  // 4. System Section
  {
    heading: "SYSTEM",
    items: [
      { label: "Reports", href: "/tenant/reports", icon: "ChartColumn", module: "reports" },
      { label: "Clients", href: "/tenant/clients", icon: "Users", module: "clients" },
      { label: "Invoices", href: "/tenant/invoices", icon: "Receipt", module: "invoices" },
      { label: "Agents", href: "/tenant/agents", icon: "Users", module: "agents" },
      { label: "Services", href: "/tenant/services", icon: "Wrench", module: "services" },
      { label: "Team", href: "/tenant/photographers", icon: "Camera", module: "team" },
      { label: "Reminders", href: "/tenant/reminders", icon: "Bell", module: "reminders" },
      { label: "Newsletter", href: "/tenant/newsletter", icon: "Newspaper", module: "newsletter" },
      { label: "Settings", href: "/tenant/settings", icon: "Settings", module: "settings" },
    ],
  },
];
