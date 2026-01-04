import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function getTenantBranding(tenantId?: string) {
  let id = tenantId;

  if (!id) {
    const session = await auth();
    id = session?.user?.tenantId;
  }

  if (!id) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      brandColor: true,
    }
  });

  return tenant;
}

export async function getWorkspaceName(user: any, tenantName: string) {
  if (user.role === "AGENT" || user.role === "CLIENT") {
    if (user.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: user.clientId },
        select: { businessName: true, name: true }
      });
      if (client) {
        return client.businessName || client.name;
      }
    }
  }
  return tenantName;
}

