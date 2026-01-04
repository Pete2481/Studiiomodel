
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkServices() {
  try {
    const services = await prisma.service.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' }
    });
    console.log('TOTAL SERVICES:', services.length);
    console.log('SERVICES SAMPLE:', JSON.stringify(services, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value, 2));
    
    const count = await prisma.service.count();
    console.log('TOTAL COUNT IN DB:', count);
  } catch (error) {
    console.error('DB CHECK ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkServices();

