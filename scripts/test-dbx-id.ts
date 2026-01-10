import { getDropboxTemporaryLink } from "../src/app/actions/dropbox";

async function main() {
  const fileId = "id:5wctcE_wU-AAAAAAACuD2Q";
  const tenantId = "cmpcx6tyofx";
  
  console.log(`Testing get_temporary_link with ID: ${fileId}`);
  const result = await getDropboxTemporaryLink(fileId, tenantId);
  console.log(JSON.stringify(result, null, 2));
}

main();

