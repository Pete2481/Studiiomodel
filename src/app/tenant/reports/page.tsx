import { DashboardShell } from "@/components/layout/dashboard-shell";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma, checkSubscriptionStatus } from "@/lib/tenant-guard";
import { getNavCounts } from "@/lib/nav-utils";
import { ReportsOverview } from "@/components/dashboard/report-overview";
import { ReportsActions } from "@/components/dashboard/reports-actions";
import { headers } from "next/headers";
import { 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  format, 
  subMonths, 
  startOfYear, 
  endOfYear,
  eachMonthOfInterval,
  parseISO
} from "date-fns";

export default async function ReportsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await headers();
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const sessionUser = session.user as any;
  const tenantId = sessionUser.tenantId;
  const tPrisma = await getTenantPrisma();
  const searchParams = await props.searchParams;

  const user = {
    name: sessionUser.name || "User",
    role: sessionUser.role || "CLIENT",
    clientId: sessionUser.clientId || null,
    agentId: sessionUser.agentId || null,
    initials: sessionUser.name?.split(' ').map((n: string) => n[0]).join('') || "U",
    avatarUrl: sessionUser.image || null,
    permissions: sessionUser.permissions || {}
  };

  const isSubscribed = await checkSubscriptionStatus(tenantId);
  const navCounts = await getNavCounts(tenantId, sessionUser.id, user.role, user.agentId, user.clientId, user.permissions);

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
      where: { 
        deletedAt: null,
        status: { in: ['SENT', 'PAID', 'OVERDUE'] }
      },
      include: { 
        lineItems: {
          include: { service: true }
        },
        client: true
      }
    }),
    tPrisma.gallery.findMany({
      where: { 
        deletedAt: null,
        status: 'DELIVERED'
      },
      select: { createdAt: true, deliveredAt: true, tenantId: true }
    }),
    tPrisma.tenant.findUnique({
      where: { id: session.user.tenantId as string },
      select: { 
        id: true,
        name: true, 
        logoUrl: true, 
        settings: true, 
        abn: true, 
        taxLabel: true, 
        taxRate: true, 
        accountName: true, 
        accountNumber: true, 
        invoiceTerms: true, 
        invoiceLogoUrl: true, 
        brandColor: true 
      }
    }),
    tPrisma.service.findMany({
      where: { deletedAt: null },
      include: {
        _count: { select: { bookingServices: true } }
      }
    }),
    tPrisma.client.findMany({
      where: { deletedAt: null },
      include: {
        bookings: {
          where: { 
            deletedAt: null, 
            status: { in: ['APPROVED', 'PENCILLED', 'COMPLETED'] } 
          },
          select: { id: true, startAt: true }
        },
        invoices: {
          where: { 
            deletedAt: null, 
            status: { in: ['SENT', 'PAID', 'OVERDUE'] } 
          },
          select: { lineItems: true, discount: true, taxRate: true, issuedAt: true }
        }
      }
    })
  ]);

  // 3. Aggregate Data for KPIs & Charts (SCOPED TO PERIOD)
  
  // KPI: Period Total (Revenue)
  const totalInPeriod = invoices
    .filter(inv => inv.issuedAt && inv.issuedAt >= periodStart && inv.issuedAt <= periodEnd)
    .reduce((acc, inv) => {
      const subtotal = inv.lineItems.reduce((s, li) => s + (Number(li.quantity) * Number(li.unitPrice)), 0);
      const tax = (subtotal - Number(inv.discount)) * Number(inv.taxRate);
      return acc + subtotal - Number(inv.discount) + tax;
    }, 0);

  // KPI: Completed Jobs (In Period)
  const completedJobsInPeriod = galleries.filter(g => g.deliveredAt && g.deliveredAt >= periodStart && g.deliveredAt <= periodEnd).length;

  // NEW: Client Leaderboard (Revenue & Volume) - SCOPED TO PERIOD
  const clientLeaderboard = clients
    .map(c => {
      // Scoped invoices
      const scopedInvoices = c.invoices.filter(inv => inv.issuedAt && inv.issuedAt >= periodStart && inv.issuedAt <= periodEnd);
      const revenue = scopedInvoices.reduce((acc, inv) => {
        const subtotal = inv.lineItems.reduce((s, li) => s + (Number(li.quantity) * Number(li.unitPrice)), 0);
        const tax = (subtotal - Number(inv.discount)) * Number(inv.taxRate);
        return acc + subtotal - Number(inv.discount) + tax;
      }, 0);
      
      // Scoped bookings
      const scopedBookings = c.bookings.filter(b => b.startAt >= periodStart && b.startAt <= periodEnd);
      const volume = scopedBookings.length;
      
      // Churn logic remains global for strategic value, or can be scoped
      const lastBooking = c.bookings.sort((a, b) => b.startAt.getTime() - a.startAt.getTime())[0];
      const isAtRisk = lastBooking 
        ? (now.getTime() - lastBooking.startAt.getTime()) > (21 * 24 * 60 * 60 * 1000) 
        : false;

      return { id: c.id, name: c.businessName || c.name, revenue, volume, isAtRisk };
    })
    .filter(c => c.revenue > 0 || c.volume > 0) // Only show active ones in this period
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // NEW: Revenue Mix (Donut) - SCOPED TO PERIOD
  const revenueMixMap: Record<string, number> = {};
  invoices
    .filter(inv => inv.issuedAt && inv.issuedAt >= periodStart && inv.issuedAt <= periodEnd)
    .forEach(inv => {
      inv.lineItems.forEach(li => {
        const category = li.service?.name || li.description || "Other";
        const itemRevenue = Number(li.quantity) * Number(li.unitPrice);
        revenueMixMap[category] = (revenueMixMap[category] || 0) + itemRevenue;
      });
    });

  const revenueMix = Object.entries(revenueMixMap)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // KPI: Revenue Target & Progress (Annual) - ALWAYS ANNUAL
  const yearStart = startOfYear(periodStart);
  const yearEnd = endOfYear(periodStart);
  const revenueTotalAnnual = invoices
    .filter(inv => inv.status === 'PAID' && inv.paidAt && inv.paidAt >= yearStart && inv.paidAt <= yearEnd)
    .reduce((acc, inv) => acc + Number(inv.paidAmount), 0);
  const revenueTarget = (tenant?.settings as any)?.revenueTarget || 100000;

  // KPI: Outstanding Balance - GLOBAL SNAPSHOT
  const outstandingBalance = invoices
    .filter(inv => inv.status === 'SENT' || inv.status === 'OVERDUE')
    .reduce((acc, inv) => {
      const subtotal = inv.lineItems.reduce((s, li) => s + (Number(li.quantity) * Number(li.unitPrice)), 0);
      const tax = (subtotal - Number(inv.discount)) * Number(inv.taxRate);
      const total = subtotal - Number(inv.discount) + tax;
      return acc + (total - Number(inv.paidAmount));
    }, 0);

  // Chart: Weekly Sales Pulse (Daily) - SCOPED TO SELECTED WEEK
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const weeklySalesDaily = weekDays.map(day => {
    const dayTotal = invoices
      .filter(inv => inv.issuedAt && format(inv.issuedAt, "yyyy-MM-dd") === format(day, "yyyy-MM-dd"))
      .reduce((acc, inv) => {
        const subtotal = inv.lineItems.reduce((s, li) => s + (Number(li.quantity) * Number(li.unitPrice)), 0);
        return acc + subtotal - Number(inv.discount);
      }, 0);
    return { label: format(day, "EEE"), value: dayTotal };
  });

  // Chart: Annual Growth (Monthly) - SCOPED TO SELECTED YEAR
  const yearMonths = eachMonthOfInterval({ start: yearStart, end: yearEnd });
  const yearlySalesMonthly = yearMonths.map(m => {
    const mStart = startOfMonth(m);
    const mEnd = endOfMonth(m);
    const mTotal = invoices
      .filter(inv => inv.issuedAt && inv.issuedAt >= mStart && inv.issuedAt <= mEnd)
      .reduce((acc, inv) => {
        const subtotal = inv.lineItems.reduce((s, li) => s + (Number(li.quantity) * Number(li.unitPrice)), 0);
        return acc + subtotal - Number(inv.discount);
      }, 0);
    return { label: format(m, "MMM"), value: mTotal };
  });

  // Chart: Monthly Detailed Trend (Daily) - SCOPED TO SELECTED MONTH
  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(baseDate);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const monthlySalesDaily = monthDays.map(day => {
    const dayTotal = invoices
      .filter(inv => inv.issuedAt && format(inv.issuedAt, "yyyy-MM-dd") === format(day, "yyyy-MM-dd"))
      .reduce((acc, inv) => {
        const subtotal = inv.lineItems.reduce((s, li) => s + (Number(li.quantity) * Number(li.unitPrice)), 0);
        return acc + subtotal - Number(inv.discount);
      }, 0);
    return { label: format(day, "d"), value: dayTotal };
  });

  // Chart: Service Popularity - SCOPED TO PERIOD
  const servicesInPeriod = invoices
    .filter(inv => inv.issuedAt && inv.issuedAt >= periodStart && inv.issuedAt <= periodEnd)
    .flatMap(inv => inv.lineItems)
    .reduce((acc: any, li) => {
      const name = li.service?.name || li.description;
      acc[name] = (acc[name] || 0) + li.quantity;
      return acc;
    }, {});

  const servicesBookedTop = Object.entries(servicesInPeriod)
    .map(([label, value]: any) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const stats = {
    view,
    selectedDate,
    periodLabel: view === "month" ? format(periodStart, "MMMM yyyy") : `Week of ${format(periodStart, "dd MMM")}`,
    totalInPeriod,
    completedJobsInPeriod,
    revenueTotalAnnual,
    revenueTarget,
    outstandingBalance,
    monthlySalesDaily,
    weeklySalesDaily,
    yearlySalesMonthly,
    currencyPrefix: "$",
    clientLeaderboard,
    revenueMix,
    servicesBookedTop,
    // Keep options for the header
    monthOptions: Array.from({ length: 12 }, (_, i) => ({
      value: format(startOfMonth(new Date(2025, i, 1)), "yyyy-MM-dd"),
      label: format(new Date(2025, i, 1), "MMMM")
    })),
    yearOptions: [2026, 2025, 2024].map(y => ({
      value: String(y),
      label: String(y)
    })),
  };


  return (
    <DashboardShell 
      user={JSON.parse(JSON.stringify(user))}
      workspaceName={(tenant as any)?.name || "Studiio Tenant"}
      logoUrl={(tenant as any)?.logoUrl || undefined}
      brandColor={(tenant as any)?.brandColor || undefined}
      title="Performance Insights"
      subtitle="Monitor revenue, team output, and client value with live dashboards."
    >
      <ReportsOverview tenantId={tenantId} stats={JSON.parse(JSON.stringify(stats))} />
    </DashboardShell>
  );
}
