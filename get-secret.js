const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { name: 'Media Drive' },
    select: { calendarSecret: true }
  });
  console.log('Secret:', tenant.calendarSecret);
}

main().finally(() => prisma.$disconnect());

