const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const member = await prisma.teamMember.findFirst({
    where: { 
      email: { equals: 'do@mediadrive.com.au', mode: 'insensitive' } 
    },
    include: {
      membership: {
        include: {
          user: true
        }
      }
    }
  });
  console.log(JSON.stringify(member, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

