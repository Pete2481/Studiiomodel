import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { MASTER_ADMIN_EMAIL } from "./src/lib/env";

const prisma = new PrismaClient();

async function main() {
  const masterEmail = (MASTER_ADMIN_EMAIL || "team@studiio.au").toLowerCase();

  console.log("🚀 Starting professional seed...");

  // 1. Ensure Master Admin exists
  const master = await prisma.user.upsert({
    where: { email: masterEmail },
    update: { isMasterAdmin: true },
    create: {
      email: masterEmail,
      name: "Studiio Master Admin",
      isMasterAdmin: true,
    },
  });
  console.info(`✅ Master admin ready: ${master.email}`);

  // 2. Helper to bootstrap a tenant with standard services (Professional default)
  const bootstrapTenant = async (slug: string, name: string) => {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) return null;

    console.log(`🏗️  Bootstrapping standard services for ${name}...`);
    
    const standardServices = [
      { name: "Standard Real Estate Shoot", price: 250, duration: 60, icon: "Camera" },
      { name: "Twilight Drone Package", price: 180, duration: 45, icon: "Zap" },
      { name: "Floor Plan - 2D/3D", price: 95, duration: 30, icon: "FileText" },
      { name: "Virtual Staging", price: 45, duration: 15, icon: "Wrench" },
    ];

    for (const s of standardServices) {
      await prisma.service.upsert({
        where: { 
          id: `${slug}-${s.name.toLowerCase().replace(/\s+/g, '-')}` 
        },
        update: {},
        create: {
          id: `${slug}-${s.name.toLowerCase().replace(/\s+/g, '-')}`,
          tenantId: tenant.id,
          name: s.name,
          description: `Professional ${s.name.toLowerCase()} service.`,
          price: s.price,
          durationMinutes: s.duration,
          icon: s.icon,
          active: true,
        }
      });
    }
    return tenant;
  };

  // 3. Populate Media Drive (Dev/Demo Tenant)
  const mediaDrive = await prisma.tenant.findUnique({ where: { slug: "media-drive" } });
  if (mediaDrive) {
    await bootstrapTenant("media-drive", "Media Drive");
    
    // Create a demo client if none exists
    const client = await prisma.client.upsert({
      where: { tenantId_slug: { tenantId: mediaDrive.id, slug: "bresicwhitney" } },
      update: {},
      create: {
        tenantId: mediaDrive.id,
        slug: "bresicwhitney",
        name: "Sarah Jenkins",
        businessName: "BresicWhitney",
        email: "sarah@bresicwhitney.com.au",
        status: "ACTIVE",
      },
    });

    console.log("✨ Dev tenant 'Media Drive' hydrated with demo data.");
  }

  console.log("🏁 Seed complete.");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
