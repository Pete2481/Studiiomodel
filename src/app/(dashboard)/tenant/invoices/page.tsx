import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { InvoicePageContent } from "@/components/modules/invoices/invoice-page-content";
import { checkSubscriptionStatus } from "@/lib/tenant-guard";
import { permissionService } from "@/lib/permission-service";
import { headers } from "next/headers";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  await headers();
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  if (!permissionService.can(session.user, "viewInvoices")) {
    redirect("/");
  }

  return (
    <div className="space-y-12">
      <ShellSettings 
        title="Invoices" 
        subtitle="Manage your billing and collection cycles." 
      />
      
      <Suspense fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      }>
        <InvoicesDataWrapper session={session} />
      </Suspense>
    </div>
  );
}

async function InvoicesDataWrapper({ session }: { session: any }) {
  const tenantId = session.user.tenantId;
  const userRole = (session.user as any).role;
  const clientId = (session.user as any).clientId;

  const [invoices, tenant, isSubscribed] = await Promise.all([
    prisma.invoice.findMany({
      where: { 
        tenantId,
        deletedAt: null,
        ...(userRole === 'CLIENT' ? { clientId } : {})
      },
      include: {
        client: { select: { id: true, name: true, businessName: true, email: true } },
        lineItems: true,
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { 
        id: true, name: true, logoUrl: true, brandColor: true, 
        autoInvoiceReminders: true, invoiceDueDays: true, abn: true, 
        taxLabel: true, taxRate: true, accountName: true, bsb: true, 
        accountNumber: true, invoiceTerms: true, invoiceLogoUrl: true 
      }
    }),
    checkSubscriptionStatus(tenantId)
  ]);

  const serializedInvoices = invoices.map(inv => {
    const total = inv.lineItems.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.unitPrice)), 0);
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
      lineItems: inv.lineItems.map(item => ({ ...item, unitPrice: Number(item.unitPrice) }))
    };
  });

  return (
    <InvoicePageContent 
      invoices={serializedInvoices} 
      role={userRole} 
      isActionLocked={!isSubscribed}
      tenantSettings={tenant ? JSON.parse(JSON.stringify(tenant)) : undefined}
    />
  );
}
