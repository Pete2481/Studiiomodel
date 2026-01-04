import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AgentPageContent } from "@/components/modules/agents/agent-page-content";
import { headers } from "next/headers";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  await headers();
  const session = await auth();
  const sessionUser = session?.user as any;

  if (!sessionUser || !sessionUser.tenantId) {
    redirect("/login");
  }

  const role = sessionUser.role;

  return (
    <div className="space-y-12">
      <ShellSettings 
        title="Agents" 
        subtitle={role === "CLIENT" ? "Manage your agency team." : "Manage all agency crew members."} 
      />
      
      <Suspense fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      }>
        <AgentsDataWrapper sessionUser={sessionUser} />
      </Suspense>
    </div>
  );
}

async function AgentsDataWrapper({ sessionUser }: { sessionUser: any }) {
  const tenantId = sessionUser.tenantId;
  const clientId = sessionUser.clientId;
  const role = sessionUser.role;

  let agents: any[] = [];
  let clientInfo = null;

  if (role === "CLIENT") {
    if (!clientId) {
      return (
        <div className="p-12 text-center bg-white rounded-[32px] shadow-sm border border-slate-100">
          <p className="text-slate-500 font-medium">Client account not found.</p>
        </div>
      );
    }

    agents = await prisma.agent.findMany({
      where: { tenantId, clientId, deletedAt: null },
      orderBy: { name: "asc" },
    });

    clientInfo = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, businessName: true }
    });
  } else if (role === "TENANT_ADMIN" || role === "ADMIN") {
    agents = await prisma.agent.findMany({
      where: { tenantId, deletedAt: null },
      include: { client: { select: { businessName: true } } },
      orderBy: { name: "asc" },
    });
  } else {
    redirect("/");
  }

  const serializedAgents = agents.map(a => ({
    ...a,
    createdAt: a.createdAt?.toISOString(),
    updatedAt: a.updatedAt?.toISOString(),
    deletedAt: a.deletedAt?.toISOString(),
    agencyName: a.client?.businessName || clientInfo?.businessName || "Unknown Agency"
  }));

  return (
    <AgentPageContent 
      initialAgents={serializedAgents}
      role={role}
      clientId={clientId}
      clientInfo={clientInfo}
    />
  );
}
