import { processImageWithAI } from "../src/app/actions/ai-edit";

async function main() {
  const assetUrl = "http://localhost:3000/api/dropbox/assets/cmk1y6zr10001c90hvezcze99?path=%2FDSC03001.jpg&sharedLink=https%3A%2F%2Fwww.dropbox.com%2Fscl%2Ffo%2F22pp4cgmnf6um898z33sx%2FAAebppzbpeXkofwf8SN7ulA%3Frlkey%3Drnty3u64k3mnttfg2iw72tusd%26dl%3D0&id=id:5wctcE_wU-AAAAAAACuD2Q";
  const taskType = "sky_replacement";
  const dbxPath = "/DSC03001.jpg";
  const tenantId = "cmpcx6tyofx";

  console.log("--- STARTING E2E AI TEST ---");
  console.log(`Task: ${taskType}`);
  console.log(`Path: ${dbxPath}`);
  
  try {
    const result = await processImageWithAI(assetUrl, taskType, undefined, dbxPath, tenantId);
    console.log("--- TEST RESULT ---");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("--- TEST FAILED ---");
    console.error(error);
  }
}

main();

