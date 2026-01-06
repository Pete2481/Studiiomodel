"use server";

import { getTenantPrisma } from "@/lib/tenant-guard";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { TeamMemberRole } from "@prisma/client";
import { notificationService } from "@/server/services/notification.service";
import { permissionService } from "@/lib/permission-service";
import { randomBytes } from "crypto";

// Default permission sets for each role (aligned with UI toggles)
const DEFAULT_PERMISSIONS: Record<TeamMemberRole, any> = {
  ADMIN: {
    viewCalendar: true,
    viewBookings: true,
    viewBlankedBookings: true,
    viewAllBookings: true,
    viewAllGalleries: true,
    deleteGallery: true,
    viewInvoices: true,
    manageGalleries: true,
    manageServices: true,
    manageClients: true,
    manageTeam: true,
  },
  PHOTOGRAPHER: {
    viewCalendar: true,
    viewBookings: true,
    viewBlankedBookings: false,
    viewAllBookings: true,
    viewAllGalleries: true,
    deleteGallery: false,
    viewInvoices: false,
    manageGalleries: false,
    manageServices: false,
    manageClients: false,
    manageTeam: false,
  },
  EDITOR: {
    viewCalendar: false,
    viewBookings: false,
    viewBlankedBookings: false,
    viewAllBookings: false,
    viewAllGalleries: true,
    deleteGallery: false,
    viewInvoices: false,
    manageGalleries: true,
    manageServices: false,
    manageClients: false,
    manageTeam: false,
  },
  ACCOUNTS: {
    viewCalendar: true,
    viewBookings: true,
    viewBlankedBookings: false,
    viewAllBookings: true,
    viewAllGalleries: false,
    deleteGallery: false,
    viewInvoices: true,
    manageGalleries: false,
    manageServices: false,
    manageClients: false,
    manageTeam: false,
  }
};

export async function upsertTeamMember(data: any) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." };
    }

    const tPrisma = await getTenantPrisma();
    
    // MOVE DATA READING ABOVE LOGS
    const { 
      id, 
      displayName, 
      email, 
      phone, 
      role, 
      status,
      avatarUrl: rawAvatarUrl,
      permissions
    } = data;

    // SAFETY: Never store massive base64 images in the DB.
    // They crash the Next.js serialization engine.
    const avatarUrl = (rawAvatarUrl && rawAvatarUrl.length > 5000) ? null : rawAvatarUrl;

    // SAFETY: Master Admin cannot be a Team Member
    if (email) {
      const user = await prisma.user.findFirst({
        where: { email: email.toLowerCase().trim() },
        select: { isMasterAdmin: true }
      });
      if (user?.isMasterAdmin) {
        return { success: false, error: "Master Admin cannot be a Team Member." };
      }
    }

    const newSecret = randomBytes(16).toString("hex");
    console.log("[TURBO-DEBUG] UPSERT ATTEMPT:", { 
      name: displayName, 
      email, 
      status,
      hasSecret: !!newSecret,
      avatarSize: avatarUrl?.length || 0 
    });

    const normalizedRole = role.toUpperCase();
    
    // Explicit mapping to ensure we use the exact enum values from the generated client
    let validRole: TeamMemberRole;
    if (normalizedRole === "ADMIN") validRole = TeamMemberRole.ADMIN;
    else if (normalizedRole === "EDITOR") validRole = TeamMemberRole.EDITOR;
    else if (normalizedRole === "ACCOUNTS") validRole = TeamMemberRole.ACCOUNTS;
    else validRole = TeamMemberRole.PHOTOGRAPHER;

    let member;
    if (id) {
      // Fetch current member to check for secret
      const currentMember = await (tPrisma as any).teamMember.findUnique({
        where: { id },
        select: { calendarSecret: true }
      });

      member = await (tPrisma as any).teamMember.update({
        where: { id },
        data: {
          displayName,
          email,
          phone,
          role: validRole,
          status: status || "ACTIVE",
          avatarUrl,
          permissions: permissions || DEFAULT_PERMISSIONS[validRole] || {},
          calendarSecret: currentMember?.calendarSecret || data.calendarSecret || randomBytes(16).toString("hex")
        },
      });
    } else {
      // 1. Check if a team member with this email already exists in this tenant
      const existingMember = email ? await (tPrisma as any).teamMember.findFirst({
        where: { email }
      }) : null;

      if (existingMember) {
        member = await (tPrisma as any).teamMember.update({
          where: { id: existingMember.id },
          data: {
            displayName,
            email,
            phone,
            role: validRole,
            status: status || "ACTIVE",
            avatarUrl,
            permissions: permissions || DEFAULT_PERMISSIONS[validRole] || {},
            calendarSecret: existingMember.calendarSecret || randomBytes(16).toString("hex")
          }
        });
      } else {
        member = await (tPrisma as any).teamMember.create({
          data: {
            displayName,
            email,
            phone,
            role: validRole,
            status: status || "ACTIVE",
            avatarUrl,
            permissions: permissions || DEFAULT_PERMISSIONS[validRole] || {},
            calendarSecret: newSecret
          },
        });
      }
    }

    // 2. Keep the linked User record in sync (if email exists)
    if (email) {
      const existingUser = await (tPrisma as any).user.findUnique({ where: { email } });
      let user = existingUser;
      
      if (!user) {
        user = await (tPrisma as any).user.create({
          data: {
            email,
            name: displayName,
            image: avatarUrl,
          }
        });
      } else {
        // Update existing user to match team member profile
        user = await (tPrisma as any).user.update({
          where: { id: existingUser.id },
          data: {
            name: displayName,
            image: avatarUrl,
          }
        });
      }

      const tenantRole = role === "ADMIN" ? "TENANT_ADMIN" : "TEAM_MEMBER";

      let membership = await (tPrisma as any).tenantMembership.findFirst({
        where: { 
          userId: user.id,
          role: tenantRole as any
        }
      });

      if (!membership) {
        membership = await (tPrisma as any).tenantMembership.create({
          data: {
            user: { connect: { id: user.id } },
            role: tenantRole as any,
          }
        });
      }

      // 3. Link membership back to TeamMember
      if (membership) {
        const conflictingMember = await (tPrisma as any).teamMember.findFirst({
          where: { membershipId: membership.id, NOT: { id: member.id } }
        });

        if (conflictingMember) {
          await (tPrisma as any).teamMember.update({
            where: { id: conflictingMember.id },
            data: { membershipId: null }
          });
        }

        await (tPrisma as any).teamMember.update({
          where: { id: member.id },
          data: { membershipId: membership.id }
        });
      }
    }

    revalidatePath("/tenant/photographers");
    revalidatePath("/mobile/team");
    revalidatePath("/");
    
    // Notifications
    try {
      if (!id) {
        await notificationService.sendTeamMemberWelcome(member.id);
      }
    } catch (notifError) {
      console.error("NOTIFICATION ERROR (non-blocking):", notifError);
    }
    
    return { success: true, memberId: String(member.id) };
  } catch (error: any) {
    console.error("UPSERT TEAM MEMBER ERROR:", error);
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}

export async function deleteTeamMember(id: string) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." };
    }

    const tPrisma = await getTenantPrisma();

    // 1. Fetch the team member to find the linked membership
    const member = await (tPrisma as any).teamMember.findUnique({
      where: { id },
      select: { membershipId: true }
    });

    // 2. Soft delete the team member and disconnect membership
    await (tPrisma as any).teamMember.update({
      where: { id },
      data: { 
        deletedAt: new Date(),
        membershipId: null // Disconnect so the membership can be deleted
      }
    });

    // 3. Delete the associated membership if it exists
    // This will remove it from the workspace selection screen immediately
    if (member?.membershipId) {
      try {
        await (tPrisma as any).tenantMembership.delete({
          where: { id: member.membershipId }
        });
      } catch (e) {
        console.error("Failed to delete membership (might be linked to other data):", e);
        // Not a fatal error, the UI filter in tenant-lookup will still hide it
      }
    }

    revalidatePath("/tenant/photographers");
    revalidatePath("/mobile/team");
    return { success: true };
  } catch (error: any) {
    console.error("DELETE TEAM MEMBER ERROR:", error);
    return { success: false, error: error.message || "Failed to delete team member." };
  }
}

export async function joinTeamAction() {
  try {
    const session = await auth();
    const user = session?.user as any;
    if (!user?.email || !user.tenantId) return { success: false, error: "Unauthorized" };

    const tPrisma = await getTenantPrisma();

    // 1. Check if they already exist as a team member
    const existing = await (tPrisma as any).teamMember.findFirst({
      where: { email: user.email, deletedAt: null }
    });

    if (existing) return { success: true, memberId: existing.id };

    // 2. Create the record
    const member = await (tPrisma as any).teamMember.create({
      data: {
        displayName: user.name || "Admin",
        email: user.email,
        role: "ADMIN", // Default to admin role within the team too
        status: "ACTIVE",
        avatarUrl: user.image,
        calendarSecret: randomBytes(16).toString("hex"),
        // Link to the membership that let them in
        membershipId: user.membershipId || null
      }
    });

    revalidatePath("/tenant/photographers");
    revalidatePath("/mobile/team");
    return { success: true, memberId: member.id };
  } catch (error: any) {
    console.error("JOIN TEAM ERROR:", error);
    return { success: false, error: error.message };
  }
}
