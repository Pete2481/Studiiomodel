import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkMemberships() {
  const allMemberships = await prisma.tenantMembership.findMany({
    include: {
      tenant: true,
      user: true,
    },
  });

  console.log("Total memberships:", allMemberships.length);
  if (allMemberships.length > 0) {
    console.log("Sample memberships:", JSON.stringify(allMemberships.slice(0, 5), null, 2));
  } else {
    console.log("No memberships found in the entire database.");
  }
}

checkMemberships()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });



