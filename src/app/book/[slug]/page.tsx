import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { BookingForm } from "./booking-form";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function PublicBookingPage({
  params
}: {
  params: Promise<{ slug: string }>
}) {
  await headers();
  const { slug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      settings: true
    }
  });

  if (!tenant) {
    notFound();
  }

  const brandColor = (tenant.settings as any)?.brandColor || "#10b981";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center">
      {/* Dynamic Branding Style */}
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --primary: ${brandColor};
          --primary-soft: ${brandColor}33;
        }
      `}} />

      <div className="w-full max-w-lg px-6 py-12 md:py-20 flex flex-col min-h-screen">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-6 mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="h-20 w-20 rounded-[32px] bg-white shadow-xl shadow-slate-200/50 flex items-center justify-center p-4 border border-slate-50 overflow-hidden">
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.name} className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-2xl font-black italic text-[var(--primary)]">{tenant.name[0]}{tenant.name[1]}</span>
            )}
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight">
              Book your next <br />
              <span className="text-[var(--primary)]">Media Session</span>
            </h1>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
              Powered by {tenant.name}
            </p>
          </div>
        </div>

        {/* The Form */}
        <div className="flex-1 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-150">
          <BookingForm tenantSlug={slug} tenantName={tenant.name} />
        </div>

        {/* Footer */}
        <div className="py-10 text-center space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
            Securely processed by <span className="text-slate-400">Studiio Pro</span>
          </p>
          <div className="flex items-center justify-center gap-6 opacity-30">
            <div className="h-4 w-4 rounded-full bg-slate-400" />
            <div className="h-4 w-4 rounded-full bg-slate-400" />
            <div className="h-4 w-4 rounded-full bg-slate-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

