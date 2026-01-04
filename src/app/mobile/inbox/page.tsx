import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { 
  Bell,
  ImageIcon,
  Calendar,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileSearchButton } from "@/components/app/mobile-search-button";

export default async function AppInbox() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const tPrisma = await getTenantPrisma();
  const clientId = (session?.user as any)?.clientId;

  const baseWhere: any = {
    updatedAt: {
      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    }
  };

  if (clientId) {
    baseWhere.clientId = clientId;
  }

  // Simulate notifications from real data
  // 1. New Galleries (last 7 days)
  const newGalleries = await tPrisma.gallery.findMany({
    where: {
      ...baseWhere,
      status: "DELIVERED",
    },
    include: { property: true },
    orderBy: { updatedAt: "desc" }
  });

  // 2. Confirmed Bookings
  const confirmedBookings = await tPrisma.booking.findMany({
    where: {
      ...baseWhere,
      status: "APPROVED",
    },
    include: { property: true },
    orderBy: { updatedAt: "desc" }
  });

  // Combine and sort
  const notifications = [
    ...newGalleries.map(g => ({
      id: `g-${g.id}`,
      type: "GALLERY",
      title: "Gallery Ready",
      message: `Your assets for ${g.property?.name || g.title} are ready for review.`,
      date: g.updatedAt,
      href: `/gallery/${g.id}`,
      icon: ImageIcon,
      color: "text-emerald-500",
      bg: "bg-emerald-50"
    })),
    ...confirmedBookings.map(b => ({
      id: `b-${b.id}`,
      type: "BOOKING",
      title: "Booking Confirmed",
      message: `Your shoot at ${b.property?.name || b.title} is officially locked in.`,
      date: b.updatedAt,
      href: "/mobile/calendar",
      icon: Calendar,
      color: "text-primary",
      bg: "bg-primary/10"
    }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="animate-in fade-in duration-700 pb-32 min-h-screen bg-white">
      {/* Locked Header */}
      <div className="sticky top-12 z-40 px-6 pt-6 pb-4 flex items-center justify-between bg-white/90 backdrop-blur-md border-b border-slate-50">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Inbox
          </h1>
          <p className="text-sm font-medium text-slate-400">Activity & updates</p>
        </div>
        <div className="flex items-center gap-3">
          <MobileSearchButton />
          <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 relative shadow-sm border border-slate-100/50">
            <Bell className="h-6 w-6" />
            {notifications.length > 0 && (
              <span className="absolute top-3 right-3 h-2.5 w-2.5 bg-primary rounded-full ring-4 ring-white" />
            )}
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="mt-8 px-6 space-y-4">
        {notifications.length > 0 ? (
          notifications.map((notif) => {
            const Icon = notif.icon;
            return (
              <Link key={notif.id} href={notif.href} className="block group active:scale-[0.98] transition-all">
                <div className="p-5 rounded-[32px] bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-100 transition-all flex gap-4">
                  <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center shrink-0", notif.bg)}>
                    <Icon className={cn("h-6 w-6", notif.color)} />
                  </div>
                  <div className="flex-1 space-y-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-black uppercase tracking-wider text-slate-900">{notif.title}</h4>
                      <span className="text-[10px] font-bold text-slate-400">{format(notif.date, "h:mma")}</span>
                    </div>
                    <p className="text-[13px] font-medium text-slate-500 leading-relaxed pr-4">
                      {notif.message}
                    </p>
                    <div className="flex items-center gap-1 pt-1 text-[10px] font-bold text-primary">
                      View details <ChevronRight className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        ) : (
          <EmptyState 
            icon={CheckCircle2}
            title="You're all caught up"
            description="No new notifications at this time. We'll let you know when there's an update."
            className="mt-12"
          />
        )}
      </div>
    </div>
  );
}

// Helper for classes
function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}

