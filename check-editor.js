const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'do@mediadrive.com.au';
  
  console.log(`Checking database for: ${email}`);

  const user = await prisma.user.findFirst({
    where: { 
      email: { equals: email, mode: 'insensitive' } 
    },
    include: {
      memberships: {
        include: { tenant: true }
      }
    }
  });

  const teamMember = await prisma.teamMember.findFirst({
    where: { 
      email: { equals: email, mode: 'insensitive' } 
    }
  });

  console.log('--- USER DATA ---');
  console.log(JSON.stringify(user, null, 2));
  
  console.log('--- TEAM MEMBER DATA ---');
  console.log(JSON.stringify(teamMember, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

