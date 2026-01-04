import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { InvoicePageContent } from "@/components/modules/invoices/invoice-page-content";
import { checkSubscriptionStatus } from "@/lib/tenant-guard";
import { permissionService } from "@/lib/permission-service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  await headers();
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  // 1. VIEW INVOICES Check
  if (!permissionService.can(session.user, "viewInvoices")) {
    redirect("/");
  }

  const tenantId = session.user.tenantId;
  const userRole = (session.user as any).role;
  const clientId = (session.user as any).clientId;

  const user = {
    name: session.user.name || "User",
    role: (session.user as any).role || "CLIENT",
    clientId: (session.user as any).clientId || null,
    agentId: (session.user as any).agentId || null,
    initials: session.user.name?.split(' ').map(n => n[0]).join('') || "U",
    avatarUrl: session.user.image || null,
    permissions: (session.user as any).permissions || {}
  };

  const isSubscribed = await checkSubscriptionStatus(tenantId);

  const invoices = await prisma.invoice.findMany({
    where: { 
      tenantId,
      deletedAt: null,
      ...(userRole === 'CLIENT' ? { clientId } : {})
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          businessName: true,
          email: true,
        }
      },
      lineItems: true,
    },
    orderBy: {
      createdAt: 'desc',
    }
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { 
      name: true, 
      logoUrl: true, 
      brandColor: true, 
      autoInvoiceReminders: true, 
      invoiceDueDays: true, 
      abn: true, 
      taxLabel: true, 
      taxRate: true, 
      accountName: true, 
      bsb: true, 
      accountNumber: true, 
      invoiceTerms: true, 
      invoiceLogoUrl: true 
    }
  });

  // Serialize Decimal to Number for Client Component
  const serializedInvoices = invoices.map(inv => {
    const total = inv.lineItems.reduce((acc, item) => {
      return acc + (Number(item.quantity) * Number(item.unitPrice));
    }, 0);

    return {
      ...inv,
      id: String(inv.id),
      total: total,
      discount: Number(inv.discount),
      taxRate: Number(inv.taxRate),
      paidAmount: Number(inv.paidAmount),
      issuedAt: inv.issuedAt?.toISOString() || null,
      dueAt: inv.dueAt?.toISOString() || null,
      sentAt: inv.sentAt?.toISOString() || null,
      paidAt: inv.paidAt?.toISOString() || null,
      viewedAt: inv.viewedAt?.toISOString() || null,
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
      lineItems: inv.lineItems.map(item => ({
        ...item,
        unitPrice: Number(item.unitPrice)
      }))
    };
  });

  return (
    <DashboardShell
      user={JSON.parse(JSON.stringify(user))}
      workspaceName={tenant?.name || "Studiio Tenant"}
      logoUrl={tenant?.logoUrl || undefined}
      brandColor={tenant?.brandColor || undefined}
      title="Invoices"
      subtitle="Manage your billing and collection cycles."
      isActionLocked={!isSubscribed}
    >
      <InvoicePageContent 
        invoices={serializedInvoices} 
        role={userRole} 
        isActionLocked={!isSubscribed}
        tenantSettings={tenant ? JSON.parse(JSON.stringify(tenant)) : undefined}
      />
    </DashboardShell>
  );
}
