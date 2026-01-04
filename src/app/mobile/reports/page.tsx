import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { redirect } from "next/navigation";
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
import { MobileSearchButton } from "@/components/app/mobile-search-button";
import { ReportsMobileContent } from "@/components/dashboard/reports-mobile-content";

export default async function MobileReportsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const tPrisma = await getTenantPrisma();
  const searchParams = await props.searchParams;

  const now = new Date();
  const selectedYear = (searchParams.year as string) || format(now, "yyyy");
  const selectedMonth = (searchParams.month as string) || format(now, "M");
  const selectedWeekStart = (searchParams.weekStart as string) || format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");

  const monthDate = parseISO(`${selectedYear}-${selectedMonth.padStart(2, '0')}-01`);
  const weekStartDate = parseISO(selectedWeekStart);

  const [invoices, galleries, services] = await Promise.all([
    tPrisma.invoice.findMany({
      where: { 
        deletedAt: null,
        status: { in: ['SENT', 'PAID', 'OVERDUE'] }
      },
      include: { lineItems: true }
    }),
    tPrisma.gallery.findMany({
      where: { 
        deletedAt: null,
        status: 'DELIVERED'
      },
      select: { createdAt: true, deliveredAt: true }
    }),
    tPrisma.service.findMany({
      where: { deletedAt: null },
      include: {
        _count: { select: { bookingServices: true } }
      }
    })
  ]);

  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const totalThisMonth = invoices
    .filter(inv => inv.issuedAt && inv.issuedAt >= monthStart && inv.issuedAt <= monthEnd)
    .reduce((acc, inv) => {
      const subtotal = inv.lineItems.reduce((s, li) => s + (Number(li.quantity) * Number(li.unitPrice)), 0);
      const tax = (subtotal - Number(inv.discount)) * Number(inv.taxRate);
      return acc + subtotal - Number(inv.discount) + tax;
    }, 0);

  const yearStart = startOfYear(parseISO(`${selectedYear}-01-01`));
  const yearEnd = endOfYear(parseISO(`${selectedYear}-12-31`));
  const revenueTotal = invoices
    .filter(inv => inv.status === 'PAID' && inv.paidAt && inv.paidAt >= yearStart && inv.paidAt <= yearEnd)
    .reduce((acc, inv) => acc + Number(inv.paidAmount), 0);
  
  const weekStart = startOfWeek(weekStartDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekStartDate, { weekStartsOn: 1 });
  const completedJobsThisWeek = galleries.filter(g => g.deliveredAt && g.deliveredAt >= weekStart && g.deliveredAt <= weekEnd).length;
  const completedJobsThisMonth = galleries.filter(g => g.deliveredAt && g.deliveredAt >= monthStart && g.deliveredAt <= monthEnd).length;

  const deliveredGalleries = galleries.filter(g => g.deliveredAt && g.createdAt);
  const avgTurnaroundDays = deliveredGalleries.length > 0
    ? Math.round(deliveredGalleries.reduce((acc, g) => acc + (g.deliveredAt!.getTime() - g.createdAt.getTime()), 0) / (deliveredGalleries.length * 1000 * 60 * 60 * 24))
    : 0;

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

  const servicesBookedTop = services
    .map(s => ({
      label: s.name,
      value: s._count.bookingServices
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const stats = {
    totalThisMonth,
    revenueTotal,
    avgTurnaroundDays,
    completedJobsThisWeek,
    completedJobsThisMonth,
    monthlySalesDaily,
    weeklySalesDaily,
    yearlySalesMonthly,
    selectedMonth,
    selectedYear,
    selectedWeekStart,
    servicesBookedTop,
    weeklySalesTotal: weeklySalesDaily.reduce((acc, d) => acc + d.value, 0),
    monthlySalesTotal: monthlySalesDaily.reduce((acc, d) => acc + d.value, 0),
    yearlySalesTotal: yearlySalesMonthly.reduce((acc, d) => acc + d.value, 0),
  };

  return (
    <div className="animate-in fade-in duration-700 pb-32 min-h-screen bg-white">
      {/* Locked Header */}
      <div className="sticky top-12 z-40 px-6 pt-6 pb-4 flex items-center justify-between bg-white/90 backdrop-blur-md border-b border-slate-50">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Insights
          </h1>
          <p className="text-sm font-medium text-slate-400">Business performance</p>
        </div>
        <div className="flex items-center gap-3">
          <MobileSearchButton />
        </div>
      </div>

      <div className="mt-8">
        <ReportsMobileContent stats={JSON.parse(JSON.stringify(stats))} />
      </div>
    </div>
  );
}

