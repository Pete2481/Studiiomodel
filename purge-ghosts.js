const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenantId = 'cmjr0qkhw0000c9cwp68q3x2c';
  
  // Find all bookings that are NOT placeholders and have NO clientId
  const targets = await prisma.booking.findMany({
    where: {
      tenantId,
      isPlaceholder: false,
      clientId: null
    }
  });

  console.log(`Found ${targets.length} ghost bookings with no client.`);
  
  if (targets.length > 0) {
    const res = await prisma.booking.deleteMany({
      where: {
        id: { in: targets.map(t => t.id) }
      }
    });
    console.log(`Successfully deleted ${res.count} ghost bookings.`);
  }
}

main().finally(() => prisma.$disconnect());

