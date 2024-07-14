import { ScratchArchive } from "./ScratchArchive.js";

const username = process.env.SCRATCH_USERNAME;
const password = process.env.SCRATCH_PASSWORD;

async function runArchive() {
  const fespadeaArchive = new ScratchArchive();
  // await fespadeaArchive.logIn(username, password);
  // fespadeaArchive.addUser("Fespadea_Tester", {}, 1);
  // fespadeaArchive.addUser("Paperboy200", {}, 1);
  // fespadeaArchive.addUser("100codelyoko", {}, 1);
  fespadeaArchive.setArchivePath("./ScratchArchiveOld/");
  await fespadeaArchive.loadArchive();
  // await fespadeaArchive.completeDataSweeps(true);
  fespadeaArchive.setArchivePath("./ScratchArchive/");
  await fespadeaArchive.storeArchive();
  // await fespadeaArchive.cleanUpArchive();
  // console.log(fespadeaArchive);
}

runArchive();
