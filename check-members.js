const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const members = await prisma.teamMember.findMany({
    where: { membershipId: { not: null } },
    take: 5,
    include: { 
      membership: { 
        include: { user: true } 
      } 
    }
  });
  console.log(JSON.stringify(members, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

