const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'do@mediadrive.com.au';
  const tenantId = 'cmjr0qkhw0000c9cwp68q3x2c';
  const teamMemberId = 'cmjrhxuax000oc9go9nz57xa6';

  console.log(`Fixing login for: ${email}`);

  // 1. Create User
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Do Nam',
    }
  });
  console.log(`User created/found: ${user.id}`);

  // 2. Create TenantMembership
  let membership = await prisma.tenantMembership.findFirst({
    where: {
      tenantId,
      userId: user.id,
      role: 'TEAM_MEMBER'
    }
  });

  if (!membership) {
    membership = await prisma.tenantMembership.create({
      data: {
        tenantId,
        userId: user.id,
        role: 'TEAM_MEMBER'
      }
    });
  }
  console.log(`Membership created/found: ${membership.id}`);

  // 3. Link TeamMember to Membership
  const updatedTeamMember = await prisma.teamMember.update({
    where: { id: teamMemberId },
    data: {
      membershipId: membership.id
    }
  });
  console.log(`TeamMember linked: ${updatedTeamMember.id}`);

  console.log('Fix complete. The editor should now be able to log in.');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

