import path from "path";
import { promises as fs } from "fs";

const PROJECT_TITLE_REGEX = "^(.*)";
const TIME_STAMP_REGEX = " (\\d{4}-\\d{2}-\\d{2}T\\d{6}\\.000Z)";
const PROJECT_TYPE_REGEX = "\\.(sb[23]?)$";

/**
 * @param {string} fileName
 * @returns string
 */
export function getValidFilename(fileName) {
  return fileName.replace(/[|&\/\\#,+()$~%'":*?<>{}]/g, "");
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

export async function getFolders(path) {
  try {
    return (await fs.readdir(path, { withFileTypes: true }))
      .filter((file) => file.isDirectory())
      .map((folder) => folder.parentPath + folder.name + "/");
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    } else {
      throw error;
    }
  }
}

export async function getFiles(path) {
  try {
    return (await fs.readdir(path, { withFileTypes: true }))
      .filter((file) => file.isFile())
      .map((file) => file.parentPath + file.name);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    } else {
      throw error;
    }
  }
}

export async function loadJSON(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    } else {
      throw error;
    }
  }
}

export async function loadJSONs(folderPath) {
  try {
    return Promise.all(
      (await getFiles(folderPath))
        .filter((file) => /.json$/.test(file))
        .map((jsonFile) => loadJSON(jsonFile))
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    } else {
      throw error;
    }
  }
}

export async function loadProject(filePath) {
  try {
    const project = {};
    project.arrayBuffer = Buffer.from(await fs.readFile(filePath));
    const fileName = filePath.split("\\").pop().split("/").pop();
    // note that the colons aren't present in the time in the filename because
    // windows doesn't allow colons in file names (also, wayback machine doesn't
    // track ms, so I just assume 000)
    let matches = fileName.match(
      new RegExp(PROJECT_TITLE_REGEX + TIME_STAMP_REGEX + PROJECT_TYPE_REGEX)
    );
    let projectVariableName = "_waybackProject";
    if (matches === null) {
      matches = fileName.match(
        new RegExp(PROJECT_TITLE_REGEX + PROJECT_TYPE_REGEX)
      );
      projectVariableName = "_project";
      project.type = matches[2];
    } else {
      project.date = new Date(
        matches[2].slice(0, 13) +
          ":" +
          matches[2].slice(13, 15) +
          ":" +
          matches[2].slice(15)
      );
      project.type = matches[3];
    }
    project.title = matches[0];
    return { [projectVariableName]: project };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    } else {
      throw error;
    }
  }
}

export async function loadProjects(folderPath) {
  try {
    return Promise.all(
      (await getFiles(folderPath))
        .filter((file) => new RegExp(PROJECT_TYPE_REGEX).test(file))
        .map((projectFile) => loadProject(projectFile))
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    } else {
      throw error;
    }
  }
}

export async function moveFolder(oldPath, newPath) {
  try {
    await fs.cp(oldPath, newPath, { recursive: true });
    await fs.rm(oldPath, { recursive: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

export class SimpleRateLimiter {
  constructor(interval, tokensPerInterval) {
    this.interval = interval;
    this.tokensPerInterval = tokensPerInterval;
    this.tokensLeft = new Proxy(
      {},
      {
        get: function (target, name) {
          return target.hasOwnProperty(name) ? target[name] : tokensPerInterval;
        },
      }
    );
    this.lastTime = new Proxy(
      {},
      {
        get: function (target, name) {
          return target.hasOwnProperty(name) ? target[name] : 0;
        },
      }
    );
  }

  async removeTokens(tokens, hostname) {
    const timeLeft = this.lastTime[hostname] + this.interval - Date.now();
    // console.log(`timeLeft: ${timeLeft}`);
    if (timeLeft <= 0) {
      this.tokensLeft[hostname] = this.tokensPerInterval;
      this.lastTime[hostname] = Date.now();
      //   console.log(`timeLeft <= 0: ${timeLeft <= 0}`);
    }
    // console.log(`tokens <= this.tokensLeft: ${tokens <= this.tokensLeft}`);
    if (tokens <= this.tokensLeft[hostname]) {
      this.tokensLeft[hostname] -= tokens;
    } else {
      const tokensToPass = tokens - this.tokensLeft[hostname];
      this.tokensLeft[hostname] = 0;
      await sleep(timeLeft);
      this.removeTokens(tokensToPass);
    }
    // console.log(`this.tokensLeft: ${this.tokensLeft}`);
  }
}
