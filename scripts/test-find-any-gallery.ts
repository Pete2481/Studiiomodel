import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const gallery = await prisma.gallery.findFirst({
    include: {
      tenant: {
        select: {
          id: true,
          dropboxAccessToken: true
        }
      }
    }
  });
  console.log(JSON.stringify(gallery, null, 2));
  await prisma.$disconnect();
}

main();

