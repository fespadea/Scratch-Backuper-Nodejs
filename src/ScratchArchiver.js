import { ScratchArchive } from "./ScratchArchive.js";

const username = process.env.SCRATCH_USERNAME;
const password = process.env.SCRATCH_PASSWORD;

async function runArchive() {
  const fespadeaArchive = new ScratchArchive();
  // await fespadeaArchive.logIn(username, password);
  // fespadeaArchive.addUser("Fespadea_Tester", {}, 1);
  // fespadeaArchive.addUser("Paperboy200", {}, 1);
  fespadeaArchive.addUser("100codelyoko", {}, 1);
  // await fespadeaArchive.loadArchive();
  await fespadeaArchive.completeDataSweeps(true);
  // await fespadeaArchive.storeArchive();
  // await fespadeaArchive.cleanUpArchive();
  console.log(
    fespadeaArchive.users.find((user) => user.username === "100codelyoko")
  );
}

runArchive();
