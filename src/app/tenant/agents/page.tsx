import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AgentPageContent } from "@/components/modules/agents/agent-page-content";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  await headers();
  const session = await auth();
  const sessionUser = session?.user as any;

  if (!sessionUser || !sessionUser.tenantId) {
    redirect("/login");
  }

  // Get user details
  const tenantId = sessionUser.tenantId;
  const clientId = sessionUser.clientId;
  const role = sessionUser.role;

  // Fetch agents based on context
  let agents: any[] = [];
  let clientInfo = null;

  if (role === "CLIENT") {
    if (!clientId) {
      return (
        <DashboardShell title="Agents" subtitle="Manage your agency team.">
          <div className="p-12 text-center bg-white rounded-[32px] shadow-sm border border-slate-100">
            <p className="text-slate-500 font-medium">Client account not found.</p>
          </div>
        </DashboardShell>
      );
    }

    agents = await prisma.agent.findMany({
      where: {
        tenantId,
        clientId,
        deletedAt: null,
      },
      orderBy: { name: "asc" },
    });

    clientInfo = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, businessName: true }
    });
  } else if (role === "TENANT_ADMIN") {
    // Tenant admin can see all agents
    agents = await prisma.agent.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      include: {
        client: {
          select: { businessName: true }
        }
      },
      orderBy: { name: "asc" },
    });
  } else {
    redirect("/");
  }

  // Serialize agents for client component
  const serializedAgents = agents.map(a => ({
    ...a,
    createdAt: a.createdAt?.toISOString(),
    updatedAt: a.updatedAt?.toISOString(),
    deletedAt: a.deletedAt?.toISOString(),
    agencyName: a.client?.businessName || clientInfo?.businessName || "Unknown Agency"
  }));

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, logoUrl: true }
  });

  const user = {
    name: sessionUser.name || "User",
    role: sessionUser.role || "CLIENT",
    clientId: sessionUser.clientId || null,
    agentId: sessionUser.agentId || null,
    initials: sessionUser.name?.split(' ').map((n: string) => n[0]).join('') || "U",
    avatarUrl: sessionUser.image || null,
    permissions: sessionUser.permissions || {}
  };

  return (
    <DashboardShell 
      user={JSON.parse(JSON.stringify(user))}
      workspaceName={tenant?.name || "Studiio Tenant"}
      logoUrl={tenant?.logoUrl || undefined}
      title="Agents" 
      subtitle={role === "CLIENT" ? `Manage agents for ${clientInfo?.businessName}` : "Manage all agency crew members."}
    >
      <AgentPageContent 
        initialAgents={serializedAgents}
        role={role}
        clientId={clientId}
        clientInfo={clientInfo}
      />
    </DashboardShell>
  );
}

