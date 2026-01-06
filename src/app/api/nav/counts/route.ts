import { auth } from "@/auth";
import { getNavCounts } from "@/lib/nav-utils";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as any;
  const counts = await getNavCounts(
    session.user.tenantId,
    sessionUser.id,
    sessionUser.role,
    sessionUser.agentId,
    sessionUser.clientId,
    sessionUser.permissions
  );

  return NextResponse.json(counts);
}

