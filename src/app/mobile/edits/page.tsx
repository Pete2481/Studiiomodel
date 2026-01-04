import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { MobileSearchButton } from "@/components/app/mobile-search-button";
import { EditMobileContent } from "@/components/modules/edits/edit-mobile-content";

export default async function MobileEditsPage() {
  const session = await auth();
  const tPrisma = await getTenantPrisma();
  const clientId = (session?.user as any)?.clientId;

  const where: any = {};
  if (clientId) {
    where.clientId = clientId;
  }

  const editRequests = await tPrisma.editRequest.findMany({
    where,
    include: {
      gallery: { 
        select: { 
          title: true,
          invoices: {
            where: { deletedAt: null },
            select: { id: true, status: true, number: true },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        } 
      },
      client: { select: { name: true, businessName: true } },
      selectedTags: { include: { editTag: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return (
    <div className="animate-in fade-in duration-700 pb-32 min-h-screen bg-white">
      {/* Locked Header */}
      <div className="sticky top-12 z-40 px-6 pt-6 pb-4 flex items-center justify-between bg-white/90 backdrop-blur-md border-b border-slate-50">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Edit Requests
          </h1>
          <p className="text-sm font-medium text-slate-400">Post-production tasks</p>
        </div>
        <MobileSearchButton />
      </div>

      <div className="mt-8">
        <EditMobileContent 
          initialRequests={JSON.parse(JSON.stringify(editRequests))} 
          userRole={session?.user?.role || "CLIENT"}
        />
      </div>
    </div>
  );
}

