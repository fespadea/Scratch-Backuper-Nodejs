/**
 * @param {string} filename
 * @returns string
 */
export function getValidFilename(filename) {
  return filename.replace(/[ &\/\\#,+()$~%.'":*?<>{}]/g, "");
}

/**
 * @param {string} foldername
 * @returns string
 */
export function getValidPath(foldername) {
  return getValidFilename(foldername);
}

/**
 *
 * @param {number} ms
 * @returns Promise
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
