import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { redirect } from "next/navigation";
import { format, isToday, isTomorrow, startOfToday } from "date-fns";
import { 
  Calendar,
  Clock,
  MapPin,
  Plus
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileSearchButton } from "@/components/app/mobile-search-button";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AppCalendar() {
  await headers();
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const tPrisma = await getTenantPrisma();
  const clientId = (session?.user as any)?.clientId;

  const baseWhere: any = {
    deletedAt: null,
    startAt: {
      gte: startOfToday()
    },
  };

  if (clientId) {
    baseWhere.clientId = clientId;
  }

  const bookings = await tPrisma.booking.findMany({
    where: baseWhere,
    orderBy: { startAt: "asc" },
    include: {
      property: true,
      services: {
        include: { service: true }
      }
    }
  });

  return (
    <div className="animate-in fade-in duration-700 pb-32 min-h-screen bg-white">
      {/* Locked Header */}
      <div className="sticky top-12 z-40 px-6 pt-6 pb-4 flex items-center justify-between bg-white/90 backdrop-blur-md border-b border-slate-50">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Schedule
          </h1>
          <p className="text-sm font-medium text-slate-400">Your upcoming shoots</p>
        </div>
        <div className="flex items-center gap-3">
          <MobileSearchButton />
          <button className="h-14 w-14 rounded-[24px] bg-primary text-white flex items-center justify-center shadow-xl shadow-primary/20 transition-all active:scale-95">
            <Plus className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="mt-8 space-y-8">
        {/* Date Groups */}
        <div className="px-6 space-y-10">
          {bookings.length > 0 ? (
            bookings.map((booking, idx) => {
              const showDateHeader = idx === 0 || 
                format(bookings[idx-1].startAt, "yyyy-MM-dd") !== format(booking.startAt, "yyyy-MM-dd");

              return (
                <div key={booking.id} className="space-y-4">
                  {showDateHeader && (
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-slate-200" />
                      {isToday(booking.startAt) ? "Today" : isTomorrow(booking.startAt) ? "Tomorrow" : format(booking.startAt, "EEEE, MMM d")}
                    </h3>
                  )}
                  
                  <div className="group relative">
                    <div className="absolute inset-y-0 left-0 w-1 bg-primary rounded-full transition-all group-hover:w-2" />
                    <div className="pl-6 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <h4 className="text-lg font-bold text-slate-900 truncate">
                            {booking.property?.name || booking.title}
                          </h4>
                          <div className="flex items-center gap-3 text-slate-400">
                            <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider">
                              <Clock className="h-3 w-3" />
                              {format(booking.startAt, "h:mma")}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider">
                              <MapPin className="h-3 w-3" />
                              {booking.property?.city || "Local"}
                            </span>
                          </div>
                        </div>
                        <div className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-wider">
                          {booking.status}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {booking.services.map((s: any) => (
                          <span key={s.id} className="px-2 py-1 bg-slate-50 border border-slate-100 rounded-md text-[9px] font-bold text-slate-500 uppercase">
                            {s.service.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyState 
              icon={Calendar}
              title="No shoots scheduled"
              description="Your upcoming production days will appear here. Book your next shoot to get started."
              className="mt-12"
            />
          )}
        </div>
      </div>
    </div>
  );
}
