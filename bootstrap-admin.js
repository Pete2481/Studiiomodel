const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = process.env.MASTER_ADMIN_EMAIL || 'team@studiio.au';
  
  console.log(`🚀 Bootstrapping Master Admin: ${email}`);
  
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      isMasterAdmin: true,
      name: 'Master Admin',
    },
    create: {
      email,
      name: 'Master Admin',
      isMasterAdmin: true,
    },
  });

  console.log(`✅ Success! User ${user.id} is now a Master Admin.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

