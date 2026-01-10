import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkUser() {
  const email = process.argv[2] || "peterhogan@me.com";
  const normalizedEmail = email.toLowerCase().trim();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      memberships: {
        include: {
          tenant: true,
          client: true,
          teamMember: true,
        },
      },
    },
  });

  if (!user) {
    console.log("No user found with email:", normalizedEmail);
    const anyUser = await prisma.user.findFirst();
    if (anyUser) {
        console.log("Sample user in DB:", anyUser.email);
    } else {
        console.log("No users in DB at all.");
    }
    return;
  }

  console.log("User found:", JSON.stringify(user, null, 2));
}

checkUser()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });

