import { ScratchArchive } from "./ScratchArchive.js";

const username = process.env.SCRATCH_USERNAME;
const password = process.env.SCRATCH_PASSWORD;

async function runArchive() {
  const scratchArchive = new ScratchArchive();
  await scratchArchive.logIn(username, password);
  // scratchArchive.addUser("fespadea", {}, 0);
  // scratchArchive.addProject(10051760, {}, "fespadea", 0);
  // scratchArchive.addUser("Fespadea_Tester", {}, 1);
  // scratchArchive.addUser("Paperboy200", {}, 1);
  // scratchArchive.addUser("100codelyoko", {}, 1);
  // await scratchArchive.loadArchive();
  // await scratchArchive.completeDataSweeps(true);
  // await scratchArchive.storeArchive();
  // await scratchArchive.cleanUpArchive();
  // console.log(scratchArchive);
}

runArchive();
