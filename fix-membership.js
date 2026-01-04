const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const targetEmail = 'pete@mediadrive.com.au';
  
  console.log('🔍 Locating user and tenant...');
  
  const user = await prisma.user.upsert({
    where: { email: targetEmail },
    update: {},
    create: {
      email: targetEmail,
      name: 'Pete Media Drive',
    },
  });

  const tenant = await prisma.tenant.findFirst({
    orderBy: { createdAt: 'desc' }
  });

  if (tenant) {
    console.log('✅ Found tenant:', tenant.name);
    
    // Using create since we know this is a fresh link
    await prisma.tenantMembership.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role: 'TENANT_ADMIN',
        hasFullClientAccess: true,
      },
    });
    
    console.log('✨ Success! You can now log in with:', targetEmail);
  } else {
    console.log('❌ No tenant found.');
  }
}

main()
  .catch(e => {
    if (e.code === 'P2002') {
      console.log('💡 User already linked to this tenant!');
    } else {
      console.error(e);
    }
  })
  .finally(() => prisma.$disconnect());
