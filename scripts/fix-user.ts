import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixUser() {
  const email = "peterhogan@me.com";
  const tenantSlug = "media-drive"; // From earlier investigation

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    console.log("User not found, creating user...");
    await prisma.user.create({
      data: {
        email,
        name: "Peter Hogan",
        isMasterAdmin: true,
      },
    });
  } else {
    console.log("User found, updating to Master Admin...");
    await prisma.user.update({
      where: { id: user.id },
      data: { isMasterAdmin: true },
    });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
  });

  if (!tenant) {
    console.log("Tenant not found:", tenantSlug);
    return;
  }

  const existingMembership = await prisma.tenantMembership.findFirst({
    where: {
      userId: user?.id || (await prisma.user.findUnique({ where: { email } }))!.id,
      tenantId: tenant.id,
    },
  });

  if (!existingMembership) {
    console.log("Creating membership for Peter Hogan in Media Drive...");
    await prisma.tenantMembership.create({
      data: {
        userId: user?.id || (await prisma.user.findUnique({ where: { email } }))!.id,
        tenantId: tenant.id,
        role: "TENANT_ADMIN",
      },
    });
  } else {
    console.log("Membership already exists.");
  }

  console.log("Fix complete!");
}

fixUser()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });



