import { auth } from "@/auth";
import { getNavCounts } from "@/lib/nav-utils";
import { cached, tenantTag } from "@/lib/server-cache";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as any;
  const tenantId = String(session.user.tenantId);
  const userId = String(sessionUser.id || "");
  const role = String(sessionUser.role || "CLIENT");
  const agentId = sessionUser.agentId ? String(sessionUser.agentId) : "";
  const clientId = sessionUser.clientId ? String(sessionUser.clientId) : "";
  const seeAll = !!sessionUser.permissions?.seeAll;

  const counts = await cached(
    "api:navCounts",
    [tenantId, userId, role, agentId, clientId, seeAll],
    async () =>
      await getNavCounts(
        tenantId,
        userId,
        role,
        agentId,
        clientId,
        sessionUser.permissions
      ),
    { revalidateSeconds: 30, tags: [tenantTag(tenantId), `tenant:${tenantId}:nav`] },
  );

  return NextResponse.json(counts);
}

