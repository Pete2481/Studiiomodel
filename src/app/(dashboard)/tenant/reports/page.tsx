import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { ReportsOverview } from "@/components/dashboard/report-overview";
import { headers } from "next/headers";
import { 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  format, 
  startOfYear, 
  endOfYear,
  eachMonthOfInterval,
  parseISO
} from "date-fns";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReportsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await headers();
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");
  const searchParams = await props.searchParams;

  return (
    <div className="space-y-12">
      <ShellSettings 
        title="Performance Insights" 
        subtitle="Monitor revenue, team output, and client value with live dashboards." 
      />
      
      <Suspense fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      }>
        <ReportsDataWrapper session={session} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ReportsDataWrapper({ session, searchParams }: { session: any, searchParams: any }) {
  const tenantId = session.user.tenantId;
  const tPrisma = await getTenantPrisma();

  // 1. Get Filters from Query
  const now = new Date();
  const view = (searchParams.view as string) || "month";
  const selectedDate = (searchParams.date as string) || (view === "month" ? format(startOfMonth(now), "yyyy-MM-dd") : format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  
  const baseDate = parseISO(selectedDate);
  const periodStart = view === "month" ? startOfMonth(baseDate) : startOfWeek(baseDate, { weekStartsOn: 1 });
  const periodEnd = view === "month" ? endOfMonth(baseDate) : endOfWeek(baseDate, { weekStartsOn: 1 });

  // 2. Fetch Base Data
  const [invoices, galleries, tenant, services, clients] = await Promise.all([
    tPrisma.invoice.findMany({
      where: { deletedAt: null, status: { in: ['SENT', 'PAID', 'OVERDUE'] } },
      include: { lineItems: { include: { service: true } }, client: true }
    }),
    tPrisma.gallery.findMany({
      where: { deletedAt: null, status: 'DELIVERED' },
      select: { createdAt: true, deliveredAt: true, tenantId: true }
    }),
    tPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, logoUrl: true, settings: true, brandColor: true }
    }),
    tPrisma.service.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { bookingServices: true } } }
    }),
    tPrisma.client.findMany({
      where: { deletedAt: null },
      include: {
        bookings: { where: { deletedAt: null, status: { in: ['APPROVED', 'PENCILLED', 'COMPLETED'] } }, select: { id: true, startAt: true } },
        invoices: { where: { deletedAt: null, status: { in: ['SENT', 'PAID', 'OVERDUE'] } }, select: { lineItems: true, discount: true, taxRate: true, issuedAt: true } }
      }
    })
  ]);

  // 3. Aggregate Data
  const totalInPeriod = invoices
    .filter(inv => inv.issuedAt && inv.issuedAt >= periodStart && inv.issuedAt <= periodEnd)
    .reduce((acc, inv) => {
      const subtotal = inv.lineItems.reduce((s, li) => s + (Number(li.quantity) * Number(li.unitPrice)), 0);
      const tax = (subtotal - Number(inv.discount)) * Number(inv.taxRate);
      return acc + subtotal - Number(inv.discount) + tax;
    }, 0);

  const completedJobsInPeriod = galleries.filter(g => g.deliveredAt && g.deliveredAt >= periodStart && g.deliveredAt <= periodEnd).length;

  const clientLeaderboard = clients
    .map(c => {
      const scopedInvoices = c.invoices.filter(inv => inv.issuedAt && inv.issuedAt >= periodStart && inv.issuedAt <= periodEnd);
      const revenue = scopedInvoices.reduce((acc, inv) => {
        const subtotal = inv.lineItems.reduce((s, li) => s + (Number(li.quantity) * Number(li.unitPrice)), 0);
        const tax = (subtotal - Number(inv.discount)) * Number(inv.taxRate);
        return acc + subtotal - Number(inv.discount) + tax;
      }, 0);
      const scopedBookings = c.bookings.filter(b => b.startAt >= periodStart && b.startAt <= periodEnd);
      const volume = scopedBookings.length;
      const lastBooking = c.bookings.sort((a, b) => b.startAt.getTime() - a.startAt.getTime())[0];
      const isAtRisk = lastBooking ? (now.getTime() - lastBooking.startAt.getTime()) > (21 * 24 * 60 * 60 * 1000) : false;
      return { id: c.id, name: c.businessName || c.name, revenue, volume, isAtRisk };
    })
    .filter(c => c.revenue > 0 || c.volume > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const revenueMixMap: Record<string, number> = {};
  invoices.filter(inv => inv.issuedAt && inv.issuedAt >= periodStart && inv.issuedAt <= periodEnd).forEach(inv => {
    inv.lineItems.forEach(li => {
      const category = li.service?.name || li.description || "Other";
      const itemRevenue = Number(li.quantity) * Number(li.unitPrice);
      revenueMixMap[category] = (revenueMixMap[category] || 0) + itemRevenue;
    });
  });

  const revenueMix = Object.entries(revenueMixMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);

  const yearStart = startOfYear(periodStart);
  const yearEnd = endOfYear(periodStart);
  const revenueTotalAnnual = invoices
    .filter(inv => inv.status === 'PAID' && inv.paidAt && inv.paidAt >= yearStart && inv.paidAt <= yearEnd)
    .reduce((acc, inv) => acc + Number(inv.paidAmount), 0);
  const revenueTarget = (tenant?.settings as any)?.revenueTarget || 100000;

  const outstandingBalance = invoices
    .filter(inv => inv.status === 'SENT' || inv.status === 'OVERDUE')
    .reduce((acc, inv) => {
      const subtotal = inv.lineItems.reduce((s, li) => s + (Number(li.quantity) * Number(li.unitPrice)), 0);
      const tax = (subtotal - Number(inv.discount)) * Number(inv.taxRate);
      const total = subtotal - Number(inv.discount) + tax;
      return acc + (total - Number(inv.paidAmount));
    }, 0);

  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const weeklySalesDaily = weekDays.map(day => {
    const dayTotal = invoices.filter(inv => inv.issuedAt && format(inv.issuedAt, "yyyy-MM-dd") === format(day, "yyyy-MM-dd")).reduce((acc, inv) => acc + inv.lineItems.reduce((s, li) => s + (Number(li.quantity) * Number(li.unitPrice)), 0) - Number(inv.discount), 0);
    return { label: format(day, "EEE"), value: dayTotal };
  });

  const yearMonths = eachMonthOfInterval({ start: yearStart, end: yearEnd });
  const yearlySalesMonthly = yearMonths.map(m => {
    const mTotal = invoices.filter(inv => inv.issuedAt && inv.issuedAt >= startOfMonth(m) && inv.issuedAt <= endOfMonth(m)).reduce((acc, inv) => acc + inv.lineItems.reduce((s, li) => s + (Number(li.quantity) * Number(li.unitPrice)), 0) - Number(inv.discount), 0);
    return { label: format(m, "MMM"), value: mTotal };
  });

  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(baseDate);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const monthlySalesDaily = monthDays.map(day => {
    const dayTotal = invoices.filter(inv => inv.issuedAt && format(inv.issuedAt, "yyyy-MM-dd") === format(day, "yyyy-MM-dd")).reduce((acc, inv) => acc + inv.lineItems.reduce((s, li) => s + (Number(li.quantity) * Number(li.unitPrice)), 0) - Number(inv.discount), 0);
    return { label: format(day, "d"), value: dayTotal };
  });

  const servicesInPeriod = invoices.filter(inv => inv.issuedAt && inv.issuedAt >= periodStart && inv.issuedAt <= periodEnd).flatMap(inv => inv.lineItems).reduce((acc: any, li) => {
    const name = li.service?.name || li.description;
    acc[name] = (acc[name] || 0) + li.quantity;
    return acc;
  }, {});

  const servicesBookedTop = Object.entries(servicesInPeriod).map(([label, value]: any) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 5);

  const stats = {
    view, selectedDate, periodLabel: view === "month" ? format(periodStart, "MMMM yyyy") : `Week of ${format(periodStart, "dd MMM")}`,
    totalInPeriod, completedJobsInPeriod, revenueTotalAnnual, revenueTarget, outstandingBalance, monthlySalesDaily, weeklySalesDaily, yearlySalesMonthly, currencyPrefix: "$", clientLeaderboard, revenueMix, servicesBookedTop,
    monthOptions: Array.from({ length: 12 }, (_, i) => ({ value: format(startOfMonth(new Date(2025, i, 1)), "yyyy-MM-dd"), label: format(new Date(2025, i, 1), "MMMM") })),
    yearOptions: [2026, 2025, 2024].map(y => ({ value: String(y), label: String(y) })),
  };

  return <ReportsOverview tenantId={tenantId} stats={stats} />;
}
