import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const gallery = await prisma.gallery.findFirst({
    where: { tenantId: "cmk4loocl0001c9fqsnl5t0xj" },
    select: { id: true, title: true, metadata: true }
  });
  console.log(JSON.stringify(gallery, null, 2));
  await prisma.$disconnect();
}

main();

