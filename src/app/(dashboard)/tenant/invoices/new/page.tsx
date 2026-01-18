import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { InvoiceEditor } from "@/components/modules/invoices/invoice-editor";
import { checkSubscriptionStatus } from "@/lib/tenant-guard";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";

export default async function NewInvoicePage(props: {
  searchParams: Promise<{ galleryId?: string }>
}) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");
  const searchParams = await props.searchParams;
  const galleryId = searchParams?.galleryId ? String(searchParams.galleryId) : "";

  return (
    <div className="space-y-12">
      <ShellSettings 
        title="Create Invoice" 
        subtitle="Generate a new invoice for your clients." 
      />
      
      <Suspense fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      }>
        <NewInvoiceDataWrapper session={session} galleryId={galleryId} />
      </Suspense>
    </div>
  );
}

async function NewInvoiceDataWrapper({ session, galleryId }: { session: any, galleryId: string }) {
  const tenantId = session.user.tenantId;

  const [clients, services, bookings, tenant, isSubscribed, gallery] = await Promise.all([
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
    checkSubscriptionStatus(tenantId),
    galleryId
      ? prisma.gallery.findFirst({
          where: { id: galleryId, tenantId, deletedAt: null },
          include: {
            client: { select: { id: true, name: true, businessName: true, settings: true } },
            property: { select: { name: true } },
            services: { include: { service: { select: { id: true, name: true, price: true } } } },
          },
        })
      : null,
  ]);

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

  // Prefill invoice editor from gallery (without creating an invoice record yet).
  // Invoice is only created when user presses Save as Draft or Save & Send.
  const prefill = (() => {
    if (!gallery || !gallery.client) return null;
    const status = String((gallery as any).status || "").toUpperCase();
    const isDeliveredish = status === "DELIVERED" || status === "APPROVED" || status === "CONFIRMED";
    if (!isDeliveredish) return null;

    const clientSettings = ((gallery.client as any)?.settings || {}) as any;
    const priceOverrides = (clientSettings?.priceOverrides || {}) as Record<string, any>;
    const lineItems = (gallery.services || []).map((gs: any, i: number) => {
      const sid = String(gs?.service?.id || gs?.serviceId || "");
      const override = priceOverrides?.[sid];
      const unitPrice = override !== undefined ? Number(override) : Number(gs?.service?.price || 0);
      return {
        id: `prefill-${i}`,
        description: String(gs?.service?.name || ""),
        quantity: 1,
        unitPrice,
        serviceId: sid || null,
      };
    });
    return {
      galleryId: String(gallery.id),
      clientId: String(gallery.client.id),
      bookingId: String((gallery as any).bookingId || ""),
      address: String(gallery.property?.name || ""),
      lineItems,
    };
  })();

  return (
    <InvoiceEditor 
      clients={serializedClients} 
      services={serializedServices} 
      bookings={serializedBookings} 
      tenant={serializedTenant as any}
      isActionLocked={!isSubscribed}
      prefillData={prefill}
    />
  );
}
