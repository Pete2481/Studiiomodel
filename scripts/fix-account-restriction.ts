import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixUserAccount() {
  const email = "peterhogan@me.com";
  const targetTenantSlug = "media-drive-systems";
  const wrongTenantSlug = "media-drive";

  // 1. Find the user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    console.log("User not found:", email);
    return;
  }

  // 2. Remove Master Admin rights
  console.log("Removing Master Admin rights for", email);
  await prisma.user.update({
    where: { id: user.id },
    data: { isMasterAdmin: false },
  });

  // 3. Find tenant IDs
  const targetTenant = await prisma.tenant.findUnique({
    where: { slug: targetTenantSlug },
  });

  if (!targetTenant) {
    console.log("Target tenant not found:", targetTenantSlug);
    // Let's list all tenants just in case the slug is slightly different
    const allTenants = await prisma.tenant.findMany({ select: { slug: true, name: true } });
    console.log("Available tenants:", allTenants.map(t => t.slug).join(", "));
    return;
  }

  // 4. Remove all existing memberships for this user to ensure they only have one
  console.log("Removing all old memberships for user...");
  await prisma.tenantMembership.deleteMany({
    where: { userId: user.id },
  });

  // 5. Create the correct single membership
  console.log("Linking user to", targetTenantSlug, "as TENANT_ADMIN");
  await prisma.tenantMembership.create({
    data: {
      userId: user.id,
      tenantId: targetTenant.id,
      role: "TENANT_ADMIN",
    },
  });

  console.log("Account successfully restricted to", targetTenant.name);
}

fixUserAccount()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });


