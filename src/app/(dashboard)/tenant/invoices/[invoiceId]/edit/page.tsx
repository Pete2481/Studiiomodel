import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { InvoiceEditor } from "@/components/modules/invoices/invoice-editor";
import { checkSubscriptionStatus } from "@/lib/tenant-guard";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";

interface EditInvoicePageProps {
  params: Promise<{ invoiceId: string }>;
}

export default async function EditInvoicePage({ params }: EditInvoicePageProps) {
  const { invoiceId } = await params;
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  return (
    <div className="space-y-12">
      <Suspense fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      }>
        <EditInvoiceDataWrapper session={session} invoiceId={invoiceId} />
      </Suspense>
    </div>
  );
}

async function EditInvoiceDataWrapper({ session, invoiceId }: { session: any, invoiceId: string }) {
  const tenantId = session.user.tenantId;

  const [invoice, clients, services, bookings, tenant, isSubscribed] = await Promise.all([
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
      select: { id: true, title: true, clientId: true, property: { select: { name: true } } },
      orderBy: { startAt: 'desc' }
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { 
        id: true, name: true, logoUrl: true, brandColor: true, 
        autoInvoiceReminders: true, invoiceDueDays: true, abn: true, 
        taxLabel: true, taxRate: true, accountName: true, bsb: true, 
        accountNumber: true, invoiceTerms: true, invoiceLogoUrl: true, 
        taxInclusive: true,
        settings: true 
      }
    }),
    checkSubscriptionStatus(tenantId)
  ]);

  if (!invoice) notFound();

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

  const serializedServices = services.map(s => ({ ...s, price: Number(s.price) }));
  const serializedClients = clients.map(c => ({ ...c, id: String(c.id) }));
  const serializedBookings = bookings.map(b => ({
    ...b,
    id: String(b.id),
    address: String(b.property?.name || b.title),
    clientId: String(b.clientId)
  }));

  const serializedTenant = {
    ...tenant,
    settings: (tenant as any)?.settings || {},
    taxRate: (tenant as any)?.taxRate ? Number((tenant as any).taxRate) : null,
    taxInclusive: (tenant as any)?.taxInclusive ?? true,
  };

  return (
    <>
      <ShellSettings 
        title="Edit Invoice" 
        subtitle={`Update invoice #${invoice.number}`} 
      />
      <InvoiceEditor 
        clients={serializedClients} 
        services={serializedServices} 
        bookings={serializedBookings}
        initialData={serializedInvoice}
        tenant={serializedTenant as any}
        isActionLocked={!isSubscribed}
      />
    </>
  );
}
