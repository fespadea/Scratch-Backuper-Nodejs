import path from "path";
import { promises as fs } from "fs";

const RESERVED_FILE_NAMES = [
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
];
const ASCII_CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g;
export const FORBIDDEN_CHARACTERS = {
  "<": "＜",
  ">": "＞",
  ":": "∶",
  '"': "＂",
  "/": "∕",
  "\\": "⧵",
  "|": "︱",
  "?": "？",
  "*": "＊",
};

/**
 * @param {string} fileName
 * @returns string
 */
export function getValidFilename(fileName, useHomoglyphs = true) {
  let safeFileName = fileName;
  Object.entries(FORBIDDEN_CHARACTERS).forEach(([key, value]) => {
    safeFileName = safeFileName.replaceAll(key, useHomoglyphs ? value : "");
  });
  safeFileName.replace(ASCII_CONTROL_CHARACTERS, "");
  return safeFileName;
}

/**
 * @param {string} folderName
 * @returns string
 */
export function getValidFolderName(folderName) {
  let validFolderName = getValidFilename(folderName);
  if (
    validFolderName.at(-1) === "." ||
    validFolderName.at(-1) === " " ||
    validFolderName in RESERVED_FILE_NAMES
  ) {
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

export async function dumpProject(project, projectPath) {
  if (project) {
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    projectPath += getValidFilename(
      (project.date ? ` ${project.date.toISOString()}` : "") +
        `.${project.type}`
    );
    await fs.writeFile(projectPath, Buffer.from(project.arrayBuffer), {
      flag: "w",
    });
  }
}

export async function checkFile(filePath) {
  try {
    return await fs.access(filePath);
  } catch (err) {
    return null;
  }
}

export async function dumpImage(imageStream, imagePath) {
  if (imageStream) {
    await fs.mkdir(path.dirname(imagePath), { recursive: true });
    await fs.writeFile(imagePath, imageStream, {
      flag: "w",
    });
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

export async function getItemsInFolder(path) {
  try {
    return await fs.readdir(path);
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

export async function moveFile(oldPath, newPath) {
  try {
    await fs.cp(oldPath, newPath, { recursive: true });
    await fs.rm(oldPath, { recursive: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function isDirectory(path) {
  try {
    return (await fs.lstat(path)).isDirectory();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    } else {
      throw error;
    }
  }
}

const UNSAFE_KEYS = [
  "x-token",
  "scratchsessionsid",
  "token",
  "password",
  // "sessionID",
  // "xToken",
  // "scratchcsrftoken",
];
export function removePrivateInformation(unsafeString) {
  let safeString = unsafeString;
  for (const unsafeKey of UNSAFE_KEYS) {
    const unsafeRegexes = [
      new RegExp(
        `\\\\?"?${unsafeKey}\\\\?"?:\\\\?"?(?:([^\\\\",}{]+)[\\\\",}])`,
        "g"
      ),
      new RegExp(`${unsafeKey}=\\\\*"?([^"&\\\\]+)["&\\\\]`, "g"),
    ];
    for (const unsafeRegex of unsafeRegexes) {
      for (const unsafeMatch of safeString.matchAll(unsafeRegex)) {
        safeString = safeString.replace(unsafeMatch[1], "redacted");
      }
    }
  }
  return safeString;
}

export function subtractTimeStringFromDate(timeString, oldDate) {
  const stringToNumConversions = {
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 24 * 60 * 60 * 1000,
  };
  const getNumberFromTimeString = (numName) => {
    // note that the space in the regex is a special space character &nbsp;
    const numMatch = timeString.match(new RegExp(`(\\d\\d?) ${numName}`));
    return numMatch ? Number(numMatch[1]) : 0;
  };

  const newDate = new Date(oldDate);
  newDate.setMonth(newDate.getMonth() - getNumberFromTimeString("month"));
  newDate.setDate(
    newDate.getDate() -
      getNumberFromTimeString("day") -
      getNumberFromTimeString("week") * 7
  );
  newDate.setHours(newDate.getHours() - getNumberFromTimeString("hour"));
  newDate.setMinutes(newDate.getMinutes() - getNumberFromTimeString("minute"));
  return newDate;
}

export function getUserDataFromComments(comments) {
  if (comments) {
    const userDatas = comments.map((comment) => comment.author);
    comments.forEach((comment) => {
      if (comment.replies) {
        userDatas.push(...comment.replies.map((reply) => reply.author));
      }
    });
    return userDatas;
  } else {
    return [];
  }
}

export async function parseFileName(file) {
  const userIDMatch = file.match(
    /(.*\/)(([^/]*)( \{(\d+)\})?)?(\/|\.json|\.sb[23]?)$/
  );
  return {
    parentPath: userIDMatch[1],
    fileName: userIDMatch[2],
    name: userIDMatch[3],
    idAddition: userIDMatch[4],
    id: userIDMatch[5],
    type: userIDMatch[6],
  };
}

export function formatID(id) {
  if (id) return ` {${id}}`;
  else return "";
}

export function updateObjectValue(superObject, key, newValue) {
  if (newValue === null || newValue === undefined) {
    return;
  } else if (
    !(newValue instanceof Object) ||
    !(superObject[key] instanceof Object) ||
    Array.isArray(newValue) !== Array.isArray(superObject[key])
  ) {
    if (superObject[key] === newValue) {
      return;
    }
    superObject[key] = newValue;
  } else if (Array.isArray(newValue) && Array.isArray(superObject[key])) {
    const oldArray = superObject[key];
    const newArray = [...newValue];
    const newDistancesFromEnd = Array(oldArray.length);
    for (let i = 0; i < oldArray.length; i++) {
      const oldArrayItem = oldArray[i];
      let findFunction = (newArrayItem) => oldArrayItem === newArrayItem;
      if (oldArrayItem.id !== undefined) {
        findFunction = (newArrayItem) => oldArrayItem.id === newArrayItem.id;
      }
      const newObjectIndex = newArray.findIndex(findFunction);
      if (newObjectIndex > -1) {
        if (oldArrayItem instanceof Object) {
          updateObjectValue(oldArray, i, newArray[newObjectIndex]);
          newArray[newObjectIndex] = oldArrayItem;
        }
        newDistancesFromEnd[i] = newArray.length - newObjectIndex;
      }
    }
    let newDistanceFromEnd = 0;
    for (let i = newDistancesFromEnd.length - 1; i >= 0; i--) {
      const originalDistanceFromEnd = oldArray.length - i;
      if (newDistancesFromEnd[i] === undefined) {
        const newIndex = newArray.length - newDistanceFromEnd;
        newArray.splice(newIndex, 0, oldArray[i]);
        newDistancesFromEnd[i] = newDistanceFromEnd;
        for (let j = 0; j < newDistancesFromEnd.length; j++) {
          if (newDistancesFromEnd[j] > newDistanceFromEnd)
            newDistancesFromEnd[j]++;
        }
      }
      if (newDistancesFromEnd[i] <= originalDistanceFromEnd) {
        newDistanceFromEnd++;
      }
    }
    superObject[key] = newArray;
  } else {
    Object.keys(newValue).forEach((subKey) =>
      updateObjectValue(superObject[key], subKey, newValue[subKey])
    );
  }
}
