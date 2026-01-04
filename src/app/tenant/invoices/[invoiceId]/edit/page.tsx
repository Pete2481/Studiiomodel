import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { InvoiceEditor } from "@/components/modules/invoices/invoice-editor";
import { checkSubscriptionStatus } from "@/lib/tenant-guard";

interface EditInvoicePageProps {
  params: Promise<{
    invoiceId: string;
  }>;
}

export default async function EditInvoicePage({ params }: EditInvoicePageProps) {
  const { invoiceId } = await params;
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;

  const [invoice, clients, services, bookings] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { lineItems: true }
    }),
    prisma.client.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, businessName: true, avatarUrl: true, settings: true }
    }),
    prisma.service.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, price: true, icon: true }
    }),
    prisma.booking.findMany({
      where: { tenantId, deletedAt: null },
      select: { 
        id: true, 
        title: true,
        clientId: true,
        property: {
          select: {
            name: true
          }
        }
      },
      orderBy: { startAt: 'desc' }
    })
  ]);

  // USE RAW SQL to bypass Prisma Client's "Unknown Field" cache issues
  const results: any[] = await prisma.$queryRawUnsafe(
    `SELECT name, "logoUrl", "brandColor", "autoInvoiceReminders", "invoiceDueDays", 
            abn, "taxLabel", "taxRate", "accountName", bsb, "accountNumber", 
            "invoiceTerms", "invoiceLogoUrl", settings
     FROM "Tenant" WHERE id = $1 LIMIT 1`,
    tenantId
  );
  const tenant = results[0];

  if (!invoice) notFound();

  // Serialize everything for Client Component
  const serializedInvoice = {
    ...invoice,
    id: String(invoice.id),
    discount: Number(invoice.discount),
    taxRate: Number(invoice.taxRate),
    paidAmount: Number(invoice.paidAmount),
    issuedAt: invoice.issuedAt?.toISOString() || null,
    dueAt: invoice.dueAt?.toISOString() || null,
    lineItems: invoice.lineItems.map(item => ({
      ...item,
      id: String(item.id),
      unitPrice: Number(item.unitPrice)
    }))
  };

  const serializedServices = services.map(s => ({
    ...s,
    price: Number(s.price)
  }));

  const serializedClients = clients.map(c => ({
    ...c,
    id: String(c.id)
  }));

  const serializedBookings = bookings.map(b => ({
    ...b,
    id: String(b.id),
    address: String(b.property?.name || b.title),
    clientId: String(b.clientId)
  }));

  const serializedTenant = {
    ...tenant,
    settings: tenant?.settings || {},
    taxRate: tenant?.taxRate ? Number(tenant.taxRate) : null
  };

  const isSubscribed = await checkSubscriptionStatus(tenantId);

  return (
    <DashboardShell
      workspaceName={tenant?.name || "Studiio Tenant"}
      logoUrl={tenant?.logoUrl || undefined}
      brandColor={tenant?.brandColor || undefined}
      title="Edit Invoice"
      subtitle={`Update invoice #${invoice.number}`}
    >
      <InvoiceEditor 
        clients={serializedClients} 
        services={serializedServices} 
        bookings={serializedBookings}
        initialData={serializedInvoice}
        tenant={serializedTenant}
        isActionLocked={!isSubscribed}
      />
    </DashboardShell>
  );
}

