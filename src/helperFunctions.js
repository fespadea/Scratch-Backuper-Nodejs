import path from "path";
import { promises as fs } from "fs";

/**
 * @param {string} fileName
 * @returns string
 */
export function getValidFilename(fileName) {
  // return fileName.replace(/[ &\/\\#,+()$~%.'":*?<>{}]/g, "");
  return fileName.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, "");
}

/**
 * @param {string} folderName
 * @returns string
 */
export function getValidFolderName(folderName) {
  const validFolderName = getValidFilename(folderName);
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
  console.log(folderPath);
  await fs.mkdir(folderPath, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2));
}

export async function dumpProject(project, folderPath) {
  if (project) {
    await fs.mkdir(folderPath, { recursive: true }, (err) => {
      if (err) {
        return console.error(err);
      }
      console.log("Directory created successfully!");
    });
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
