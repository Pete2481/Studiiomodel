/**
 * Unified Permission Service
 * 
 * Single source of truth for all role-based access.
 */

export type Role = "MASTER_ADMIN" | "TENANT_ADMIN" | "PHOTOGRAPHER" | "EDITOR" | "CLIENT" | "ADMIN" | "ACCOUNTS" | "AGENT";

export type Module = 
  | "dashboard"
  | "reports"
  | "tenants"     // Master only
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

export interface UserContext {
  role: Role;
  clientId?: string;
  isMasterMode?: boolean; // True when viewing the global Master panel
  permissions?: Record<string, any>; // Optional JSON overrides
}

export class PermissionService {
  /**
   * Granular permission check
   */
  can(user: UserContext | any, permission: string): boolean {
    if (!user) return false;
    
    // Master Admin has absolute power
    if (user.isMasterAdmin || user.role === "MASTER_ADMIN") return true;
    
    // Tenant Admins have full power within their tenant
    if (user.role === "TENANT_ADMIN" || user.role === "ADMIN") return true;

    // Check specific permission flag
    if (user.permissions && typeof user.permissions === 'object') {
      if (user.permissions[permission] === true) return true;
      if (user.permissions[permission] === false) return false;
    }

    // Role-based defaults if no specific flag is set
    switch (permission) {
      case "viewCalendar":
        return user.role === "PHOTOGRAPHER" || user.role === "CLIENT" || user.role === "AGENT";
      case "viewBookings":
        return true;
      case "viewAllBookings":
        return user.role === "PHOTOGRAPHER";
      case "viewAllGalleries":
        return user.role === "PHOTOGRAPHER" || user.role === "EDITOR";
      case "manageGalleries":
        return user.role === "PHOTOGRAPHER" || user.role === "EDITOR";
      case "deleteGallery":
        return false; // Default off for non-admins
      case "viewInvoices":
        if (user.role === "CLIENT" || user.role === "AGENT") return !!user.permissions?.canViewInvoices;
        return user.role === "ACCOUNTS";
      case "manageServices":
        return false; // Default off for non-admins
      
      // Granular Client Portal Permissions
      case "canDownloadHighRes":
        return user.role === "CLIENT" || user.role === "AGENT" ? !!user.permissions?.canDownloadHighRes : true;
      case "canViewAllAgencyGalleries":
        return user.role === "CLIENT" || user.role === "AGENT" ? !!user.permissions?.canViewAllAgencyGalleries : true;
      case "canPlaceBookings":
        return user.role === "CLIENT" || user.role === "AGENT" ? !!user.permissions?.canPlaceBookings : true;
      case "canViewInvoices":
        return user.role === "CLIENT" || user.role === "AGENT" ? !!user.permissions?.canViewInvoices : true;
      case "canEditRequests":
        return user.role === "CLIENT" || user.role === "AGENT" ? !!user.permissions?.canEditRequests : true;
        
      default:
        return false;
    }
  }

  canViewFinancials(role: Role): boolean {
    return role === "TENANT_ADMIN" || role === "ADMIN" || role === "ACCOUNTS";
  }

  canAccessModule(user: UserContext, module: Module): boolean {
    if (!user || !user.role) return false;
    const role = user.role as string;
    const { isMasterMode, permissions } = user;

    // ... existing Master Mode logic ...
    if (isMasterMode) {
      return role === "MASTER_ADMIN" && (module === "tenants" || module === "dashboard");
    }

    if (role === "MASTER_ADMIN") return true;

    if (role === "TENANT_ADMIN" || role === "ADMIN") {
      return module !== "tenants";
    }

    // Special handling for CLIENT/AGENT granular flags
    if (role === "CLIENT" || role === "AGENT") {
      if (module === "invoices") return this.can(user, "canViewInvoices");
      if (module === "bookings") return true; // They can see their bookings
      if (module === "galleries") return true; // They can see their galleries
    }

    // Map modules to granular permissions
    const moduleToPermission: Record<string, string> = {
      calendar: "viewCalendar",
      bookings: "viewBookings",
      galleries: "viewAllGalleries",
      invoices: "viewInvoices",
      services: "manageServices",
      team: "manageTeam", // Assuming this for now
      clients: "manageClients",
    };

    const perm = moduleToPermission[module];
    if (perm) {
      return this.can(user, perm);
    }

    // Legacy role-based fallbacks for modules without granular mapping yet
    switch (module) {
      case "dashboard": 
        return role !== "EDITOR" && role !== "TEAM_MEMBER";
      case "reports": return role === "ACCOUNTS";
      case "edits":
        return true;
      case "agents":
        return role === "CLIENT";
      case "settings":
        return false;
      default:
        return false;
    }
  }

  getFilteredNav(user: UserContext, allSections: any[]) {
    const isMaster = user.role === "MASTER_ADMIN";

    return allSections.map(section => {
      // 1. Hide MASTER ONLY sections from non-master users completely
      const isMasterOnly = section.heading === "MASTER CONTROL" || 
                           section.heading === "PLATFORM WIDE";
      
      if (isMasterOnly && !isMaster) return null;

      // 2. Logic for Master Admins
      if (isMaster) {
        // If in Master Mode (Master Dashboard), we might only want to show Master sections
        if (user.isMasterMode) {
          // If in master mode, we generally want both Master Control and Platform Wide
          if (section.heading !== "MASTER CONTROL" && section.heading !== "PLATFORM WIDE") {
            return null;
          }
        } else {
          // If in Tenant Mode (acting as a studio), we hide "MASTER CONTROL" 
          // but KEEP "PLATFORM WIDE" so they can jump back to global views
          if (section.heading === "MASTER CONTROL") return null;
        }
      } else {
        // 3. Logic for regular users (Tenants/Staff/Clients)
        // Ensure they never see sections with master-only paths
        const hasMasterPaths = section.items.some((i: any) => i.href.startsWith("/master"));
        if (hasMasterPaths) return null;
      }

      // Filter items within the section
      const filteredItems = section.items.map((item: any) => {
        const hasAccess = this.canAccessModule(user, item.module);
        
        // If it has sub-items, we need to check them too
        if (item.items) {
          const filteredNestedItems = item.items.filter((nestedItem: any) => 
            this.canAccessModule(user, nestedItem.module)
          );
          
          if (filteredNestedItems.length === 0) return null;
          return { ...item, items: filteredNestedItems };
        }
        
        return hasAccess ? item : null;
      }).filter(Boolean);
      
      if (filteredItems.length === 0) return null;

      return {
        ...section,
        items: filteredItems
      };
    }).filter(Boolean);
  }
}

export const permissionService = new PermissionService();
