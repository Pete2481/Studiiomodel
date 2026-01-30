import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ShellSettings } from "@/components/layout/shell-settings";
import { ClientProfilePageContent } from "@/components/modules/profile/client-profile-page-content";

export const dynamic = "force-dynamic";

export default async function ClientProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = String((session.user as any).role || "");
  if (role !== "CLIENT" && role !== "AGENT") redirect("/");

  const tenantId = String((session.user as any).tenantId || "");
  const clientId = String((session.user as any).clientId || "");
  if (!tenantId || !clientId) redirect("/");

  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      businessName: true,
      email: true,
      phone: true,
      avatarUrl: true,
      watermarkUrl: true,
      settings: true,
    },
  });

  if (!client) redirect("/");

  const accountsEmail =
    client.settings && typeof client.settings === "object" && (client.settings as any).accountsEmail
      ? String((client.settings as any).accountsEmail)
      : "";

  return (
    <div className="space-y-12">
      <ShellSettings title="My Profile" subtitle="Update your contact details, branding, and password." />

      <ClientProfilePageContent
        initial={{
          id: client.id,
          name: client.name || "",
          businessName: client.businessName || "",
          email: client.email || "",
          phone: client.phone || "",
          avatarUrl: client.avatarUrl || "",
          watermarkUrl: client.watermarkUrl || "",
          accountsEmail,
        }}
      />
    </div>
  );
}

