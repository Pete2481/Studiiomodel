const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenantId = 'cmjr0qkhw0000c9cwp68q3x2c';
  
  const all = await prisma.booking.findMany({
    where: { tenantId }
  });

  console.log(`Total bookings for tenant: ${all.length}`);
  
  const ghosty = all.filter(b => {
    // Check for various conditions that might make it a "ghost"
    const hasNoClient = !b.clientId;
    const isNotPlaceholder = !b.isPlaceholder;
    return hasNoClient && isNotPlaceholder;
  });

  console.log(`Potential ghosts found: ${ghosty.length}`);
  
  ghosty.forEach(g => {
    console.log(`- ID: ${g.id}, Title: ${g.title}, Start: ${g.startAt.toISOString()}, ClientId: ${g.clientId}`);
  });

  // Also check for "No Client" title
  const noClientTitle = all.filter(b => b.title === 'No Client');
  console.log(`Bookings with title 'No Client': ${noClientTitle.length}`);
}

main().finally(() => prisma.$disconnect());

