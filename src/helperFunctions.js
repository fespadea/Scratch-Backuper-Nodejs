import path from "path";
import { promises as fs } from "fs";
import { time } from "console";

/**
 * @param {string} fileName
 * @returns string
 */
export function getValidFilename(fileName) {
  // TODO: replace these with similar unicode characters instead of just making
  // them blank
  return fileName.replace(/[&\/\\#,+()$~%'":*?<>{}]/g, "");
}

/**
 * @param {string} folderName
 * @returns string
 */
export function getValidFolderName(folderName) {
  let validFolderName = getValidFilename(folderName);
  if (validFolderName.at(-1) === ".") {
    validFolderName += "_";
  }
  return validFolderName;
}

/**
 *
 * @param {number} ms
 * @returns Promise
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function dumpJSON(jsonData, filePath) {
  const folderPath = path.dirname(filePath);
  await fs.mkdir(folderPath, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2));
}

export async function dumpProject(project, folderPath) {
  if (project) {
    await fs.mkdir(folderPath, { recursive: true });
    const fileName = getValidFilename(
      project.title +
        (project.date ? ` ${project.date.toISOString()}` : "") +
        `.${project.type}`
    );
    await fs.writeFile(
      folderPath + fileName,
      Buffer.from(project.arrayBuffer),
      { flag: "w" },
      (err) => {
        if (err) console.log(err);
      }
    );
  }
}

export class SimpleRateLimiter {
  constructor(interval, tokensPerInterval) {
    this.interval = interval;
    this.tokensPerInterval = tokensPerInterval;
    this.tokensLeft = tokensPerInterval;
    this.lastTime = 0;
  }

  async removeTokens(tokens) {
    const timeLeft = this.lastTime + this.interval - Date.now();
    // console.log(`timeLeft: ${timeLeft}`);
    if (timeLeft <= 0) {
      this.tokensLeft = this.tokensPerInterval;
      this.lastTime = Date.now();
    //   console.log(`timeLeft <= 0: ${timeLeft <= 0}`);
    }
    // console.log(`tokens <= this.tokensLeft: ${tokens <= this.tokensLeft}`);
    if (tokens <= this.tokensLeft) {
      this.tokensLeft -= tokens;
    } else {
      const tokensToPass = tokens - this.tokensLeft;
      this.tokensLeft = 0;
      await sleep(timeLeft);
      this.removeTokens(tokensToPass);
    }
    // console.log(`this.tokensLeft: ${this.tokensLeft}`);
  }
}
