import { getGalleryAssets } from "../src/app/actions/dropbox";

async function main() {
  const galleryId = "cmk1y6zr10001c90hvezcze99";
  const result = await getGalleryAssets(galleryId);
  console.log(JSON.stringify(result, null, 2));
}

main();

