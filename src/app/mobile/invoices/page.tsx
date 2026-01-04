import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { redirect } from "next/navigation";
import { 
  Receipt,
  Plus
} from "lucide-react";
import { MobileSearchButton } from "@/components/app/mobile-search-button";
import { InvoiceMobileContent } from "@/components/modules/invoices/invoice-mobile-content";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AppInvoicesPage() {
  await headers();
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const tPrisma = await getTenantPrisma();
  const userRole = (session.user as any).role;
  const clientId = (session.user as any).clientId;

  const invoices = await tPrisma.invoice.findMany({
    where: { 
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

  // Serialize Decimal to Number for Client Component
  const serializedInvoices = invoices.map(inv => {
    const subtotal = inv.lineItems.reduce((acc, item) => {
      return acc + (Number(item.quantity) * Number(item.unitPrice));
    }, 0);

    return {
      id: String(inv.id),
      tenantId: String(inv.tenantId),
      number: String(inv.number),
      status: String(inv.status),
      total: subtotal,
      discount: Number(inv.discount),
      taxRate: Number(inv.taxRate),
      paidAmount: Number(inv.paidAmount),
      address: inv.address || "",
      issuedAt: inv.issuedAt?.toISOString() || null,
      dueAt: inv.dueAt?.toISOString() || null,
      createdAt: inv.createdAt.toISOString(),
      client: inv.client ? {
        id: String(inv.client.id),
        name: String(inv.client.name),
        businessName: String(inv.client.businessName || ""),
      } : null,
    };
  });

  return (
    <div className="animate-in fade-in duration-700 pb-32 min-h-screen bg-white">
      {/* Locked Header */}
      <div className="sticky top-12 z-40 px-6 pt-6 pb-4 flex items-center justify-between bg-white/90 backdrop-blur-md border-b border-slate-50">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Invoices
          </h1>
          <p className="text-sm font-medium text-slate-400">Billing & payments</p>
        </div>
        <div className="flex items-center gap-3">
          <MobileSearchButton />
          {userRole !== 'CLIENT' && (
            <button className="h-14 w-14 rounded-[24px] bg-primary text-white flex items-center justify-center shadow-xl shadow-primary/20 transition-all active:scale-95">
              <Plus className="h-6 w-6" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-8">
        <InvoiceMobileContent 
          initialInvoices={serializedInvoices} 
          role={userRole}
        />
      </div>
    </div>
  );
}

