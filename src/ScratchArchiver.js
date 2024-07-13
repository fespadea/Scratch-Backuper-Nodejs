import { ScratchArchive } from "./ScratchArchive.js";

const username = process.env.SCRATCH_USERNAME;
const password = process.env.SCRATCH_PASSWORD;

async function runArchive() {
  const fespadeaArchive = new ScratchArchive();
  // await fespadeaArchive.logIn(username, password);
  // fespadeaArchive.addUser("Fespadea_Tester", {}, 1);
  fespadeaArchive.addUser("PaperBoy200", {}, 1);
  await fespadeaArchive.completeDataSweeps();
  await fespadeaArchive.storeData();
  console.log(fespadeaArchive);
}

runArchive();
