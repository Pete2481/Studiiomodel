/**
 * Seed Mock Galleries for Development
 * Creates tenants, clients, properties, and galleries from mock data
 * This allows favorites to work with mock galleries
 * 
 * Updated to work with the improved schema that includes:
 * - tenantId on all child models
 * - Soft delete support
 * - Audit fields (createdBy, updatedBy)
 */
import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding mock galleries...");

  // 1. Create or get tenant (use slug for lookup since it's unique)
  let tenant = await prisma.tenant.findUnique({
    where: { slug: "media-drive" },
  });
  
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        id: "tenant-media-drive",
        name: "Media Drive",
        slug: "media-drive",
        description: "Example photography tenant for development",
        settings: {},
      },
    });
  }
  console.log(`✅ Tenant: ${tenant.name}`);

  // 2. Create or get client
  let client = await prisma.client.findFirst({
    where: {
      tenantId: tenant.id,
      slug: "sothebys-byron",
    },
  });

  if (!client) {
    client = await prisma.client.create({
      data: {
        id: "client-sothebys-byron",
        tenantId: tenant.id,
        name: "Sotheby's Byron",
        slug: "sothebys-byron",
        email: "contact@sothebys-byron.com",
        phone: "+61 2 6685 1234",
      },
    });
  }
  console.log(`✅ Client: ${client.name}`);

  // 3. Create or get property (required for gallery)
  let property = await prisma.property.findFirst({
    where: {
      tenantId: tenant.id,
      slug: "644-hinterland-way",
    },
  });

  if (!property) {
    property = await prisma.property.create({
      data: {
        id: "property-newrybar",
        tenantId: tenant.id,
        clientId: client.id,
        name: "644 Hinterland Way",
        slug: "644-hinterland-way",
        addressLine1: "644 Hinterland Way",
        city: "Newrybar",
        state: "NSW",
        postcode: "2479",
        country: "Australia",
        latitude: -28.7,
        longitude: 153.5,
      },
    });
  }
  console.log(`✅ Property: ${property.name}`);

  // 4. Create gallery-001
  const gallery001 = await prisma.gallery.upsert({
    where: { id: "gallery-001" },
    update: {
      title: "Marine parade",
      status: "READY",
      metadata: {
        address: "Newrybar NSW, Australia",
        coverImageUrl:
          "https://www.dropbox.com/scl/fi/2t7kgw3n9gikmlut0jf9y/DJI_20251105125136_0900_D_1.jpg?rlkey=h5ugk0bfq8xybiiq2t84s6cf1&dl=0",
        sharedFolderLink:
          "https://www.dropbox.com/scl/fo/22pp4cgmnf6um898z33sx/AAebppzbpeXkofwf8SN7ulA?rlkey=rnty3u64k3mnttfg2iw72tusd&dl=0",
      },
    },
    create: {
      id: "gallery-001",
      tenantId: tenant.id,
      clientId: client.id,
      propertyId: property.id,
      title: "Marine parade",
      status: "READY",
      publishAt: new Date(),
      metadata: {
        address: "Newrybar NSW, Australia",
        coverImageUrl:
          "https://www.dropbox.com/scl/fi/2t7kgw3n9gikmlut0jf9y/DJI_20251105125136_0900_D_1.jpg?rlkey=h5ugk0bfq8xybiiq2t84s6cf1&dl=0",
        sharedFolderLink:
          "https://www.dropbox.com/scl/fo/22pp4cgmnf6um898z33sx/AAebppzbpeXkofwf8SN7ulA?rlkey=rnty3u64k3mnttfg2iw72tusd&dl=0",
      },
    },
  });
  console.log(`✅ Gallery: ${gallery001.title} (${gallery001.id})`);

  // 5. Create gallery-dji-broken-head
  let propertyBrokenHead = await prisma.property.findFirst({
    where: {
      tenantId: tenant.id,
      slug: "seven-mile-beach-road",
    },
  });

  if (!propertyBrokenHead) {
    propertyBrokenHead = await prisma.property.create({
      data: {
        id: "property-broken-head",
        tenantId: tenant.id,
        clientId: client.id,
        name: "Seven Mile Beach Road",
        slug: "seven-mile-beach-road",
        addressLine1: "Seven Mile Beach Road",
        city: "Broken Head",
        state: "NSW",
        postcode: "2481",
        country: "Australia",
        latitude: -28.7,
        longitude: 153.6,
      },
    });
  }

  const galleryBrokenHead = await prisma.gallery.upsert({
    where: { id: "gallery-dji-broken-head" },
    update: {
      title: "Seven Mile Beach Road",
      status: "READY",
      metadata: {
        address: "Broken Head NSW, Australia",
        coverImageUrl:
          "https://www.dropbox.com/scl/fi/2t7kgw3n9gikmlut0jf9y/DJI_20251105125136_0900_D_1.jpg?rlkey=h5ugk0bfq8xybiiq2t84s6cf1&dl=0",
        sharedFolderLink:
          "https://www.dropbox.com/scl/fo/22pp4cgmnf6um898z33sx/AAebppzbpeXkofwf8SN7ulA?rlkey=rnty3u64k3mnttfg2iw72tusd&dl=0",
      },
    },
    create: {
      id: "gallery-dji-broken-head",
      tenantId: tenant.id,
      clientId: client.id,
      propertyId: propertyBrokenHead.id,
      title: "Seven Mile Beach Road",
      status: "READY",
      publishAt: new Date(),
      metadata: {
        address: "Broken Head NSW, Australia",
        coverImageUrl:
          "https://www.dropbox.com/scl/fi/2t7kgw3n9gikmlut0jf9y/DJI_20251105125136_0900_D_1.jpg?rlkey=h5ugk0bfq8xybiiq2t84s6cf1&dl=0",
        sharedFolderLink:
          "https://www.dropbox.com/scl/fo/22pp4cgmnf6um898z33sx/AAebppzbpeXkofwf8SN7ulA?rlkey=rnty3u64k3mnttfg2iw72tusd&dl=0",
      },
    },
  });
  console.log(`✅ Gallery: ${galleryBrokenHead.title} (${galleryBrokenHead.id})`);

  // 6. Create some example media items for gallery-001
  const mediaItems = [
    {
      id: "media-001",
      tenantId: tenant.id,
      galleryId: gallery001.id,
      type: "IMAGE" as const,
      provider: "DROPBOX" as const,
      providerId: "dropbox-file-001",
      url: "https://www.dropbox.com/scl/fi/2t7kgw3n9gikmlut0jf9y/DJI_20251105125136_0900_D_1.jpg?rlkey=h5ugk0bfq8xybiiq2t84s6cf1&dl=0",
      thumbnailUrl: "https://www.dropbox.com/scl/fi/thumb001.jpg?rlkey=thumb&dl=0",
      metadata: {
        filename: "DJI_20251105125136_0900_D_1.jpg",
        size: 5242880,
        width: 4000,
        height: 3000,
      },
    },
    {
      id: "media-002",
      tenantId: tenant.id,
      galleryId: gallery001.id,
      type: "IMAGE" as const,
      provider: "DROPBOX" as const,
      providerId: "dropbox-file-002",
      url: "https://www.dropbox.com/scl/fi/example2.jpg?rlkey=example2&dl=0",
      metadata: {
        filename: "example2.jpg",
        size: 3145728,
        width: 3840,
        height: 2160,
      },
    },
  ];

  for (const media of mediaItems) {
    await prisma.media.upsert({
      where: { id: media.id },
      update: media,
      create: media,
    });
  }
  console.log(`✅ Created ${mediaItems.length} media items`);

  // 7. Create some example gallery favorites
  const favorites = [
    {
      id: "favorite-001",
      tenantId: tenant.id,
      galleryId: gallery001.id,
      imageId: "dropbox-file-001",
      imagePath: "/Gallery 001/DJI_20251105125136_0900_D_1.jpg",
      addedBy: "agent-001",
    },
  ];

  for (const favorite of favorites) {
    const existing = await prisma.galleryFavorite.findFirst({
      where: {
        galleryId: favorite.galleryId,
        imageId: favorite.imageId,
      },
    });

    if (!existing) {
      await prisma.galleryFavorite.create({
        data: favorite,
      });
    } else {
      await prisma.galleryFavorite.update({
        where: { id: existing.id },
        data: favorite,
      });
    }
  }
  console.log(`✅ Created ${favorites.length} gallery favorites`);

  console.log("\n🎉 Seed complete! Galleries are now in the database.");
  console.log("💡 Favorites will now work for these galleries.");
  console.log("💡 All models now include proper tenant isolation.");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
