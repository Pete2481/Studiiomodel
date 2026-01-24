import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { createTenantWithDefaults } from "@/server/services/tenant-onboarding.service";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session || !session.user.id || !session.user.isMasterAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, slug, contactName, contactEmail, contactPhone, settings } = await request.json();

    if (!name || !slug) {
      return NextResponse.json({ error: "Name and Slug are required" }, { status: 400 });
    }

    const settingsJson = settings ? JSON.parse(settings) : {};
    const created = await createTenantWithDefaults({
      name,
      slug,
      contactName,
      contactEmail,
      contactPhone,
      settings: settingsJson,
      trialDays: 90,
    });

    return NextResponse.json({ tenant: { id: created.tenantId } });
  } catch (error: any) {
    console.error("[CreateTenant Error]:", error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "A studio with this slug already exists." }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

