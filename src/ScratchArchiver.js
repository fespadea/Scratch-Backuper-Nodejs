import { ScratchArchive } from "./ScratchArchive.js";

const username = process.env.SCRATCH_USERNAME;
const password = process.env.SCRATCH_PASSWORD;

async function runArchive() {
  const fespadeaArchive = new ScratchArchive();
  await fespadeaArchive.logIn(username, password);
  fespadeaArchive.addUser(username);
  await fespadeaArchive.completeDataSweeps(0);
  await fespadeaArchive.storeData();
  console.log(fespadeaArchive);
}

runArchive();
