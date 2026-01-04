import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Find the user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          include: {
            tenant: true,
            client: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ tenants: [] });
    }

    // 2. Map memberships to a clean format for the UI
    const tenants = user.memberships.map((m) => {
      // For AGENT or CLIENT roles, use the Agency/Client name as the workspace name
      const isAgentOrClient = m.role === "AGENT" || m.role === "CLIENT";
      const workspaceName = isAgentOrClient && m.client 
        ? (m.client.businessName || m.client.name) 
        : m.tenant.name;

      return {
        id: m.id, // Use membership ID to uniquely identify this role/workspace
        tenantId: m.tenant.id, // Keep tenantId for logic if needed
        name: workspaceName,
        slug: m.tenant.slug,
        logoUrl: isAgentOrClient && m.client?.avatarUrl ? m.client.avatarUrl : m.tenant.logoUrl,
        role: m.role,
      };
    });

    // 3. Add Master Admin option if applicable
    if (user.isMasterAdmin) {
      (tenants as any).unshift({
        id: "MASTER",
        tenantId: "MASTER",
        name: "Studiio Master Admin",
        slug: "master",
        logoUrl: null,
        role: "MASTER_ADMIN" as any,
      });
    }

    return NextResponse.json({ tenants });
  } catch (error) {
    console.error("[TenantLookup Error]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

