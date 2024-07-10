import { ScratchArchive } from "./ScratchArchive.js";

const username = process.env.SCRATCH_USERNAME;
const password = process.env.SCRATCH_PASSWORD;

async function runArchive() {
  const fespadeaArchive = new ScratchArchive();
  await fespadeaArchive.logIn(username, password);
  fespadeaArchive.addUser(username);
  await fespadeaArchive.completeDataSweeps(1);
  console.log(fespadeaArchive);
}

runArchive();
