import { DashboardShell } from "@/components/layout/dashboard-shell";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import Link from "next/link";
import { Plus } from "lucide-react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MasterTenantsList, type MasterTenantRow } from "@/components/master/master-tenants-list";

export default async function MasterTenantsPage() {
  const session = await auth();

  if (!session || !session.user.isMasterAdmin) {
    redirect("/login");
  }

  const user = {
    name: session.user.name || "System Admin",
    role: "MASTER_ADMIN",
    initials: session.user.name?.split(' ').map(n => n[0]).join('') || "MA"
  };

  const filteredNav = permissionService.getFilteredNav(
    { role: user.role as any, isMasterMode: true },
    UNIFIED_NAV_CONFIG
  );

  // Re-implement the tenant cards with accurate, dashboard-aligned metrics in ONE query.
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      t.id,
      t.name,
      t.slug,
      t."contactEmail",
      t."contactPhone",
      t."deletedAt",
      t.settings,
      /* Totals */
      (SELECT COUNT(*) FROM "Booking" b 
        WHERE b."tenantId" = t.id 
          AND b."deletedAt" IS NULL 
          AND b."isPlaceholder" = false
          AND b."clientId" IS NOT NULL
      ) AS "bookingsTotal",
      (SELECT COUNT(*) FROM "Gallery" g 
        WHERE g."tenantId" = t.id 
          AND g."deletedAt" IS NULL
      ) AS "galleriesTotal",
      (SELECT COUNT(*) FROM "Client" c 
        WHERE c."tenantId" = t.id 
          AND c."deletedAt" IS NULL
      ) AS "clientsTotal",
      (SELECT COUNT(*) FROM "TenantMembership" m 
        WHERE m."tenantId" = t.id
      ) AS "usersTotal",
      /* Dashboard-aligned counts */
      (SELECT COUNT(*) FROM "EditRequest" e 
        WHERE e."tenantId" = t.id 
          AND e."status" = 'NEW'
      ) AS "newEdits",
      (SELECT COUNT(*) FROM "EditRequest" e 
        WHERE e."tenantId" = t.id 
          AND e."status" IN ('NEW', 'IN_PROGRESS')
      ) AS "openEdits",
      (SELECT COUNT(*) FROM "Booking" b 
        WHERE b."tenantId" = t.id 
          AND b."deletedAt" IS NULL
          AND b."isPlaceholder" = false
          AND b."clientId" IS NOT NULL
          AND b."status" IN ('REQUESTED', 'PENCILLED')
      ) AS "pendingBookings",
      /* Best-effort activity signal (no dedicated lastActive field in schema) */
      GREATEST(
        COALESCE((SELECT MAX(b."updatedAt") FROM "Booking" b WHERE b."tenantId" = t.id AND b."deletedAt" IS NULL), to_timestamp(0)),
        COALESCE((SELECT MAX(g."updatedAt") FROM "Gallery" g WHERE g."tenantId" = t.id AND g."deletedAt" IS NULL), to_timestamp(0)),
        COALESCE((SELECT MAX(e."updatedAt") FROM "EditRequest" e WHERE e."tenantId" = t.id), to_timestamp(0)),
        COALESCE((SELECT MAX(c."updatedAt") FROM "Client" c WHERE c."tenantId" = t.id AND c."deletedAt" IS NULL), to_timestamp(0))
      ) AS "lastActiveAt"
    FROM "Tenant" t
    ORDER BY "lastActiveAt" DESC
  `;

  const tenants: MasterTenantRow[] = rows.map((r: any) => ({
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    contactEmail: r.contactEmail ? String(r.contactEmail) : null,
    contactPhone: r.contactPhone ? String(r.contactPhone) : null,
    deletedAt: r.deletedAt ? new Date(r.deletedAt).toISOString() : null,
    bookingsTotal: Number(r.bookingsTotal || 0),
    galleriesTotal: Number(r.galleriesTotal || 0),
    clientsTotal: Number(r.clientsTotal || 0),
    usersTotal: Number(r.usersTotal || 0),
    newEdits: Number(r.newEdits || 0),
    openEdits: Number(r.openEdits || 0),
    pendingBookings: Number(r.pendingBookings || 0),
    lastActiveAt: r.lastActiveAt ? new Date(r.lastActiveAt).toISOString() : null,
    aiSuiteEnabled: (() => {
      const s = (r.settings as any) || {};
      const raw = s?.aiSuite?.enabled;
      // Default OFF for safety until platform billing is live
      return typeof raw === "boolean" ? raw : false;
    })(),
    aiSuiteFreeUnlocksRemaining: (() => {
      const s = (r.settings as any) || {};
      const raw = s?.aiSuite?.freeUnlocksRemaining;
      // Default 1 if missing (trial pack), consistent with unlock logic
      return typeof raw === "number" ? raw : 1;
    })(),
    aiSuiteRunsTotal: (() => {
      const s = (r.settings as any) || {};
      const raw = s?.aiSuite?.usage?.totalRuns;
      return typeof raw === "number" ? raw : 0;
    })(),
    aiSuiteEstimatedUsdTotal: (() => {
      const s = (r.settings as any) || {};
      const raw = s?.aiSuite?.usage?.estimatedUsdTotal;
      if (typeof raw === "number") return raw;
      const runs = typeof s?.aiSuite?.usage?.totalRuns === "number" ? s.aiSuite.usage.totalRuns : 0;
      return runs * 0.35;
    })(),
    aiSuitePackEditsOverride: (() => {
      const s = (r.settings as any) || {};
      const raw = s?.aiSuite?.packEditsOverride;
      if (raw === null) return null;
      if (typeof raw === "number") return raw;
      return null;
    })(),
  }));

  return (
    <DashboardShell 
      navSections={filteredNav} 
      user={user}
      title="All Tenants"
      subtitle="Complete list of all studios and their operational status."
      isMasterMode={true}
    >
      <div className="space-y-8">
        <div className="flex items-center justify-end">
          <Link
            href="/master/tenants/new"
            className="h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl px-6 font-bold text-sm transition-all flex items-center gap-2 shadow-xl shadow-emerald-900/10 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Create New Tenant
          </Link>
        </div>

        <MasterTenantsList initialTenants={tenants} />
      </div>
    </DashboardShell>
  );
}
