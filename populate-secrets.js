const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { 
      OR: [
        { calendarSecret: null },
        { calendarSecret: '' }
      ]
    }
  });

  console.log(`Found ${tenants.length} tenants without a calendar secret.`);

  for (const tenant of tenants) {
    const secret = 'cs_' + crypto.randomBytes(16).toString('hex');
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { calendarSecret: secret }
    });
    console.log(`Assigned secret to ${tenant.name}`);
  }
}

main().finally(() => prisma.$disconnect());
