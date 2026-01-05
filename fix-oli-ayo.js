const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'oli_2481@hotmail.com';
  const tenantSlug = 'oli-ayo-photography';

  console.log(`Searching for tenant: ${tenantSlug}`);
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: { memberships: { include: { teamMember: true, user: true } } }
  });

  if (!tenant) {
    console.log('Tenant not found');
    return;
  }

  console.log(`Tenant ID: ${tenant.id}`);
  
  const membership = tenant.memberships.find(m => m.user?.email.toLowerCase() === email.toLowerCase());
  
  if (!membership) {
    console.log('Membership not found for email:', email);
    // Create membership and team member
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: 'Oli Ayo' }
    });
    
    console.log('User ID:', user.id);
    
    const newMembership = await prisma.tenantMembership.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role: 'TENANT_ADMIN',
        hasFullClientAccess: true
      }
    });
    
    console.log('New Membership ID:', newMembership.id);
    
    const teamMember = await prisma.teamMember.create({
      data: {
        tenantId: tenant.id,
        membershipId: newMembership.id,
        displayName: 'Oli Ayo',
        email: email,
        role: 'ADMIN',
        status: 'ACTIVE',
        calendarSecret: 'tm_' + Math.random().toString(36).substring(2, 15),
        permissions: {
          viewCalendar: true,
          viewBookings: true,
          viewBlankedBookings: true,
          viewAllBookings: true,
          viewAllGalleries: true,
          deleteGallery: true,
          viewInvoices: true,
          manageGalleries: true,
          manageServices: true,
          manageClients: true,
          manageTeam: true,
        }
      }
    });
    
    console.log('Created TeamMember profile for existing admin');
  } else {
    console.log('Membership found ID:', membership.id);
    if (!membership.teamMember) {
      console.log('No TeamMember record found for this membership. Creating one...');
      const teamMember = await prisma.teamMember.create({
        data: {
          tenantId: tenant.id,
          membershipId: membership.id,
          displayName: membership.user?.name || 'Oli Ayo',
          email: email,
          role: 'ADMIN',
          status: 'ACTIVE',
          calendarSecret: 'tm_' + Math.random().toString(36).substring(2, 15),
          permissions: {
            viewCalendar: true,
            viewBookings: true,
            viewBlankedBookings: true,
            viewAllBookings: true,
            viewAllGalleries: true,
            deleteGallery: true,
            viewInvoices: true,
            manageGalleries: true,
            manageServices: true,
            manageClients: true,
            manageTeam: true,
          }
        }
      });
      console.log('Created TeamMember record');
    } else {
      console.log('TeamMember record exists. Updating status to ACTIVE...');
      await prisma.teamMember.update({
        where: { id: membership.teamMember.id },
        data: { status: 'ACTIVE', deletedAt: null }
      });
      console.log('Updated TeamMember to ACTIVE');
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
