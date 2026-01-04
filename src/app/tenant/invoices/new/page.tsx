import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { InvoiceEditor } from "@/components/modules/invoices/invoice-editor";
import { checkSubscriptionStatus } from "@/lib/tenant-guard";

export default async function NewInvoicePage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const isSubscribed = await checkSubscriptionStatus(tenantId);

  const [clients, services, bookings] = await Promise.all([
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

  // Serialize Decimal to Number
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

  return (
    <DashboardShell
      workspaceName={tenant?.name || "Studiio Tenant"}
      logoUrl={tenant?.logoUrl || undefined}
      title="Create Invoice"
      subtitle="Generate a new invoice for your clients."
    >
      <InvoiceEditor 
        clients={serializedClients} 
        services={serializedServices} 
        bookings={serializedBookings} 
        tenant={serializedTenant}
        isActionLocked={!isSubscribed}
      />
    </DashboardShell>
  );
}

