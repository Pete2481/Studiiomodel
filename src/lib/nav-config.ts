import { LucideIcon } from "lucide-react";

export type Module = 
  | "dashboard"
  | "reports"
  | "tenants"
  | "bookings"
  | "maps"
  | "galleries"
  | "edits"
  | "clients"
  | "invoices"
  | "services"
  | "team"
  | "reminders"
  | "newsletter"
  | "agents"
  | "communications"
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
  // 1) Top level
  {
    items: [
      { label: "Dashboard", href: "/", icon: "LayoutDashboard", module: "dashboard" },
      { label: "WIP", href: "/tenant/wip", icon: "Activity", module: "dashboard" },
      { label: "Calendar", href: "/tenant/calendar", icon: "Calendar", module: "bookings" },
      { label: "Maps", href: "/maps", icon: "MapPin", module: "maps" },
      { label: "Clients", href: "/tenant/clients", icon: "Users", module: "clients" },
      { label: "Agents/contacts", href: "/tenant/agents", icon: "UserPlus", module: "agents" },
    ],
  },

  // 2) OPERATIONS dropdown
  {
    heading: "Work",
    items: [
      {
        label: "Operations",
        href: "/tenant/bookings",
        icon: "Activity",
        module: "bookings",
        items: [
          { label: "Reports", href: "/tenant/reports", module: "reports" },
          { label: "Bookings", href: "/tenant/bookings", module: "bookings" },
          { label: "Past bookings", href: "/tenant/bookings/history", module: "bookings" },
          { label: "Gallery", href: "/tenant/galleries", module: "galleries" },
          { label: "Edit requests", href: "/tenant/edits", module: "edits" },
          { label: "Invoices", href: "/tenant/invoices", module: "invoices" },
          { label: "Services", href: "/tenant/services", module: "services" },
        ],
      },
    ],
  },

  // 3) STUDIO SETUP dropdown
  {
    heading: "Studio Setup",
    items: [
      {
        label: "Studio Setup",
        href: "/tenant/clients",
        icon: "Settings",
        module: "dashboard",
        items: [
          { label: "Team Members", href: "/tenant/photographers", module: "team" },
          { label: "Reminder", href: "/tenant/reminders", module: "reminders" },
          { label: "Newsletter", href: "/tenant/newsletter", module: "newsletter" },
          { label: "Settings", href: "/tenant/settings", module: "settings" },
        ],
      },
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
      {
        label: "Communications",
        href: "/master/communications/welcome",
        icon: "Newspaper",
        module: "communications",
        items: [
          { label: "Welcome Email", href: "/master/communications/welcome", module: "communications" },
          { label: "Newsletters", href: "/master/communications/newsletters", module: "communications" },
        ],
      },
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
