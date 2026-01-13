import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
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
  parseISO,
} from "date-fns";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const view = (url.searchParams.get("view") as string) || "month";
  const dateParam = url.searchParams.get("date");

  const now = new Date();
  const selectedDate =
    dateParam ||
    (view === "month"
      ? format(startOfMonth(now), "yyyy-MM-dd")
      : format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));

  const baseDate = parseISO(selectedDate);
  const periodStart = view === "month" ? startOfMonth(baseDate) : startOfWeek(baseDate, { weekStartsOn: 1 });
  const periodEnd = view === "month" ? endOfMonth(baseDate) : endOfWeek(baseDate, { weekStartsOn: 1 });

  const tPrisma = await getTenantPrisma();
  const user = session.user as any;
  const tenantId = session.user.tenantId as string;
  const canViewAll = user.role === "TENANT_ADMIN" || user.role === "ADMIN";

  // Scoping (match existing behavior)
  const invoiceScope: any = { deletedAt: null, status: { in: ["SENT", "PAID", "OVERDUE"] } };
  const galleryScope: any = { deletedAt: null, status: "DELIVERED" };
  const clientScope: any = { deletedAt: null };

  if (!canViewAll) {
    if (user.role === "CLIENT" || user.role === "AGENT") {
      invoiceScope.clientId = user.clientId;
      galleryScope.clientId = user.clientId;
      clientScope.id = user.clientId;
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const yearStart = startOfYear(periodStart);
  const yearEnd = endOfYear(periodStart);

  // Fetch only what we need (range-scoped), not entire history.
  const [tenant, invoicesInYear, invoicesOutstanding, completedJobsInPeriod] = await Promise.all([
    tPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, settings: true },
    }),
    tPrisma.invoice.findMany({
      where: {
        ...invoiceScope,
        issuedAt: { gte: yearStart, lte: yearEnd },
      },
      select: {
        id: true,
        clientId: true,
        status: true,
        issuedAt: true,
        paidAt: true,
        paidAmount: true,
        discount: true,
        taxRate: true,
        lineItems: {
          select: {
            quantity: true,
            unitPrice: true,
            description: true,
            service: { select: { name: true } },
          },
        },
      },
    }),
    tPrisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: { in: ["SENT", "OVERDUE"] },
        ...(invoiceScope.clientId ? { clientId: invoiceScope.clientId } : {}),
      },
      select: {
        paidAmount: true,
        discount: true,
        taxRate: true,
        lineItems: { select: { quantity: true, unitPrice: true } },
      },
    }),
    tPrisma.gallery.count({
      where: {
        ...galleryScope,
        deliveredAt: { gte: periodStart, lte: periodEnd },
      },
    }),
  ]);

  const invoices = invoicesInYear as any[];

  const totalInPeriod = invoices
    .filter((inv: any) => inv.issuedAt && inv.issuedAt >= periodStart && inv.issuedAt <= periodEnd)
    .reduce((acc: number, inv: any) => {
      const subtotal = inv.lineItems.reduce((s: number, li: any) => s + Number(li.quantity) * Number(li.unitPrice), 0);
      const tax = (subtotal - Number(inv.discount)) * Number(inv.taxRate);
      return acc + subtotal - Number(inv.discount) + tax;
    }, 0);

  const revenueMixMap: Record<string, number> = {};
  invoices
    .filter((inv: any) => inv.issuedAt && inv.issuedAt >= periodStart && inv.issuedAt <= periodEnd)
    .forEach((inv: any) => {
      inv.lineItems.forEach((li: any) => {
        const category = li.service?.name || li.description || "Other";
        const itemRevenue = Number(li.quantity) * Number(li.unitPrice);
        revenueMixMap[category] = (revenueMixMap[category] || 0) + itemRevenue;
      });
    });
  const revenueMix = Object.entries(revenueMixMap)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const revenueTotalAnnual = invoices
    .filter((inv: any) => inv.status === "PAID" && inv.paidAt && inv.paidAt >= yearStart && inv.paidAt <= yearEnd)
    .reduce((acc: number, inv: any) => acc + Number(inv.paidAmount), 0);

  const revenueTarget = (tenant?.settings as any)?.revenueTarget || 100000;

  const outstandingBalance = (invoicesOutstanding as any[]).reduce((acc: number, inv: any) => {
    const subtotal = inv.lineItems.reduce((s: number, li: any) => s + Number(li.quantity) * Number(li.unitPrice), 0);
    const tax = (subtotal - Number(inv.discount)) * Number(inv.taxRate);
    const total = subtotal - Number(inv.discount) + tax;
    return acc + (total - Number(inv.paidAmount));
  }, 0);

  // Trend charts
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const weeklySalesDaily = weekDays.map((day) => {
    const dayTotal = invoices
      .filter((inv: any) => inv.issuedAt && format(inv.issuedAt, "yyyy-MM-dd") === format(day, "yyyy-MM-dd"))
      .reduce(
        (acc: number, inv: any) =>
          acc + inv.lineItems.reduce((s: number, li: any) => s + Number(li.quantity) * Number(li.unitPrice), 0) - Number(inv.discount),
        0
      );
    return { label: format(day, "EEE"), value: dayTotal };
  });

  const yearMonths = eachMonthOfInterval({ start: yearStart, end: yearEnd });
  const yearlySalesMonthly = yearMonths.map((m) => {
    const mTotal = invoices
      .filter((inv: any) => inv.issuedAt && inv.issuedAt >= startOfMonth(m) && inv.issuedAt <= endOfMonth(m))
      .reduce(
        (acc: number, inv: any) =>
          acc + inv.lineItems.reduce((s: number, li: any) => s + Number(li.quantity) * Number(li.unitPrice), 0) - Number(inv.discount),
        0
      );
    return { label: format(m, "MMM"), value: mTotal };
  });

  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(baseDate);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const monthlySalesDaily = monthDays.map((day) => {
    const dayTotal = invoices
      .filter((inv: any) => inv.issuedAt && format(inv.issuedAt, "yyyy-MM-dd") === format(day, "yyyy-MM-dd"))
      .reduce(
        (acc: number, inv: any) =>
          acc + inv.lineItems.reduce((s: number, li: any) => s + Number(li.quantity) * Number(li.unitPrice), 0) - Number(inv.discount),
        0
      );
    return { label: format(day, "d"), value: dayTotal };
  });

  const servicesInPeriod = invoices
    .filter((inv: any) => inv.issuedAt && inv.issuedAt >= periodStart && inv.issuedAt <= periodEnd)
    .flatMap((inv: any) => inv.lineItems)
    .reduce((acc: any, li: any) => {
      const name = li.service?.name || li.description;
      acc[name] = (acc[name] || 0) + Number(li.quantity);
      return acc;
    }, {});
  const servicesBookedTop = Object.entries(servicesInPeriod)
    .map(([label, value]: any) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Leaderboard: compute from scoped period invoices + period bookings + last booking per client
  const periodInvoices = invoices.filter((inv: any) => inv.issuedAt && inv.issuedAt >= periodStart && inv.issuedAt <= periodEnd);

  const revenueByClientId = new Map<string, number>();
  periodInvoices.forEach((inv: any) => {
    const cid = inv.clientId ? String(inv.clientId) : "";
    if (!cid) return;
    const subtotal = inv.lineItems.reduce((s: number, li: any) => s + Number(li.quantity) * Number(li.unitPrice), 0);
    const tax = (subtotal - Number(inv.discount)) * Number(inv.taxRate);
    const total = subtotal - Number(inv.discount) + tax;
    revenueByClientId.set(cid, (revenueByClientId.get(cid) || 0) + total);
  });

  const bookingCounts = await tPrisma.booking.groupBy({
    by: ["clientId"],
    where: {
      deletedAt: null,
      status: { in: ["APPROVED", "PENCILLED", "COMPLETED"] },
      startAt: { gte: periodStart, lte: periodEnd },
      clientId: clientScope.id ? String(clientScope.id) : { not: null },
    },
    _count: { _all: true },
  });

  const lastBookings = await tPrisma.booking.findMany({
    where: {
      deletedAt: null,
      status: { in: ["APPROVED", "PENCILLED", "COMPLETED"] },
      clientId: clientScope.id ? String(clientScope.id) : { not: null },
    },
    select: { clientId: true, startAt: true },
    orderBy: { startAt: "desc" },
    distinct: ["clientId"],
    take: 5000,
  });

  const volumeByClientId = new Map<string, number>();
  bookingCounts.forEach((row: any) => {
    const cid = row.clientId ? String(row.clientId) : "";
    if (!cid) return;
    volumeByClientId.set(cid, Number(row._count?._all || 0));
  });

  const lastBookingByClientId = new Map<string, Date>();
  lastBookings.forEach((b: any) => {
    const cid = b.clientId ? String(b.clientId) : "";
    if (!cid) return;
    if (b.startAt instanceof Date) lastBookingByClientId.set(cid, b.startAt);
  });

  const leaderboardClientIds = Array.from(
    new Set<string>([...revenueByClientId.keys(), ...volumeByClientId.keys()].filter(Boolean))
  );

  const clients = await tPrisma.client.findMany({
    where: { ...clientScope, id: { in: leaderboardClientIds } },
    select: { id: true, businessName: true, name: true },
  });
  const clientNameById = new Map<string, string>();
  clients.forEach((c: any) => clientNameById.set(String(c.id), String(c.businessName || c.name)));

  const clientLeaderboard = leaderboardClientIds
    .map((id) => {
      const last = lastBookingByClientId.get(id);
      const isAtRisk = last ? now.getTime() - last.getTime() > 21 * 24 * 60 * 60 * 1000 : false;
      return {
        id,
        name: clientNameById.get(id) || "Client",
        revenue: revenueByClientId.get(id) || 0,
        volume: volumeByClientId.get(id) || 0,
        isAtRisk,
      };
    })
    .filter((c) => c.revenue > 0 || c.volume > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

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
    monthOptions: Array.from({ length: 12 }, (_, i) => ({
      value: format(startOfMonth(new Date(new Date().getFullYear(), i, 1)), "yyyy-MM-dd"),
      label: format(new Date(new Date().getFullYear(), i, 1), "MMMM"),
    })),
    yearOptions: [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map((y) => ({
      value: String(y),
      label: String(y),
    })),
  };

  return NextResponse.json({ stats });
}


