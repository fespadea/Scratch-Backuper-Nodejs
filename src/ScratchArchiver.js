import { ScratchArchive } from "./ScratchArchive.js";

const username = process.env.SCRATCH_USERNAME;
const password = process.env.SCRATCH_PASSWORD;

async function runArchive() {
  const scratchArchive = new ScratchArchive();
  await scratchArchive.logIn(username, { password });
  scratchArchive.addUser({ username: "fespadea", level: 0 });
  // scratchArchive.addProject({
  //   projectID: 10051760,
  //   username: "fespadea",
  //   level: 0,
  // });
  // scratchArchive.addUser({ username: "Fespadea_Tester", level: 1 });
  // scratchArchive.addUser({ username: "Paperboy200", level: 1 });
  // scratchArchive.addUser({ username: "100codelyoko", level: 1 });
  // await scratchArchive.loadArchive();
  await scratchArchive.completeDataSweeps({ storeAsYouGo: true });
  // await scratchArchive.storeArchive();
  // await scratchArchive.cleanUpArchive();
  console.log(scratchArchive);
}

runArchive();
