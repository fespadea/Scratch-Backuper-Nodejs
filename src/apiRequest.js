import fetch from "cross-fetch";
import Datastore from "@seald-io/nedb";
import { URL } from "url";
import { downloadProjectFromURL } from "@turbowarp/sbdl";
import {
  sleep,
  SimpleRateLimiter,
  removePrivateInformation,
} from "./helperFunctions.js";

export const XTOKEN_STRING = "x-token";
export const PROJECT_TOKEN_STRING = "token";
export const LIMIT_STRING = "limit";
export const OFFSET_STRING = "offset";
export const DATE_LIMIT_STRING = "dateLimit";

const CACHED_REQUESTS_PATH = "./cachedRequests/cachedRequests.db";
const cachedRequestsDB = new Datastore({
  filename: CACHED_REQUESTS_PATH,
  // autoload: true,
});
let needToLoadDatabase = true;

let markedIDs = new Set();
let progressChecker = 0;
let lastCheckerTime = Date.now();

const apiCallLimiter = new SimpleRateLimiter(1000, 10);
const scrapeLimiter = new SimpleRateLimiter(60000, 15);

export async function limitRate(url, { scrape = false } = {}) {
  if (scrape)
    await scrapeLimiter.removeTokens(
      1,
      url ? new URL(url).hostname : undefined
    );
  else
    await apiCallLimiter.removeTokens(
      1,
      url ? new URL(url).hostname : undefined
    );
}

async function loadCachedRequestsDatabase() {
  if (needToLoadDatabase) {
    needToLoadDatabase = false;
    await cachedRequestsDB.loadDatabaseAsync();
  }
}

/**
 *
 * @param {string} id
 * @param {object} data
 */
async function dumpAPIRequest(id, data) {
  await loadCachedRequestsDatabase();
  id = removePrivateInformation(id);
  if (data === undefined) {
    throw new Error("data cannot be undefined");
  }
  const doc = {
    _id: id,
    data: data,
  };
  await cachedRequestsDB.updateAsync(
    {
      _id: id,
    },
    doc,
    { upsert: true }
  );
  markedIDs.delete(id);
}

/**
 *
 * @param {string} id
 * @returns
 */
async function loadAPIRequest(id) {
  await loadCachedRequestsDatabase();
  id = removePrivateInformation(id);
  const result = await cachedRequestsDB.findOneAsync({
    _id: id,
  });
  if (result === null) {
    if (markedIDs.has(id)) {
      while (markedIDs.has(id)) {
        await sleep(1000);
      }
      return await loadAPIRequest(id);
    } else {
      markedIDs.add(id);
    }
    return undefined;
  } else {
    return result.data;
  }
}

/**
 * separated this out because it could get messy
 * @param {Response} request
 * @param {string} returnFunc
 * @returns
 */
async function applyReturnFunc(request, returnFunc) {
  // usually just response.json()
  return request.ok
    ? returnFunc === null
      ? request
      : returnFunc === "json" // eval is slow, so I hard coded in these functions that I actually use
      ? await request.json()
      : returnFunc === "text"
      ? await request.text()
      : returnFunc === "body"
      ? request.body
      : returnFunc === "null"
      ? null
      : await eval(`${Object.keys({ request })[0]}.${returnFunc}()`)
    : null;
}

/**
 * @param {string} url
 * @param {object} options
 * @param {boolean} [cache=true]
 * @param {string} [returnFunc="json"]
 * @returns object
 */
export async function apiRequest(
  url,
  {
    fetchOptions: options,
    cache = true,
    returnFunc = "json",
    returnHeaders = false,
    forceUpdate = false,
  } = {}
) {
  const id = JSON.stringify({
    url,
    options,
    returnFunc,
    returnHeaders,
  });

  if (cache && !forceUpdate) {
    const cachedData = await loadAPIRequest(id);
    if (cachedData !== undefined) {
      return cachedData;
    }
  }

  let notDone = true;
  let request;
  while (notDone) {
    // I just check for api call vs scrape by seeing if the return is expected
    // to be in json format (assume api calls are json)
    await limitRate(url, { scrape: returnFunc !== "json" });
    try {
      request = await fetch(url, options);
      if (!request.ok && request.status !== 404) {
        if (
          isNaN(request.headers["Retry-After"]) ||
          request.headers["Retry-After"] > 0 ||
          request.headers["Retry-After"] <= 600
        )
          throw new Error(`ConnectionError ${request.status} with url: ${id}`);
        else {
          console.error(
            new Error(
              `Retrying again after ${request.headers["Retry-After"]} seconds: ${id}`
            )
          );
          await sleep(request.headers["Retry-After"] * 1000);
        }
      } else {
        notDone = false;
      }
    } catch (error) {
      console.log(url);
      console.log(options);
      console.error(error);
      await sleep(10000);
    }
  }
  const data = await applyReturnFunc(request, returnFunc);
  const returnVal = returnHeaders
    ? { data, headers: request ? Object.fromEntries(request.headers) : null }
    : data;

  if (cache) {
    await dumpAPIRequest(id, returnVal);
  }

  if (++progressChecker % 100 === 0) {
    console.log(
      progressChecker +
        " requests in " +
        (Date.now() - lastCheckerTime) / 1000 +
        " seconds since last check."
    );
    lastCheckerTime = Date.now();
  }

  return returnVal;
}

/**
 *
 * @param {string} url
 * @param {URLSearchParams} params
 * @returns
 */
export function applyParametersToURL(url, params) {
  for (const [param, value] of params.entries()) {
    if (value === "undefined") {
      delete params.delete(param, value);
    }
  }
  const paramString = params.toString();
  if (paramString === "") {
    return url;
  } else {
    return url + "?" + params.toString();
  }
}

/**
 *
 * @param {string} url
 * @param {string} xToken
 * @returns
 */
export async function getAllResults(url, { xToken } = {}) {
  const params = new URLSearchParams();
  params.set(XTOKEN_STRING, xToken);
  const limit = 40;
  let offset = 0;
  params.set(LIMIT_STRING, limit);
  params.set(OFFSET_STRING, offset);
  let singleList = await apiRequest(applyParametersToURL(url, params));
  if (!singleList) {
    return [];
  }
  const all = singleList;
  while (singleList.length >= params.get(LIMIT_STRING)) {
    offset += limit;
    params.set(OFFSET_STRING, offset);
    singleList = await apiRequest(applyParametersToURL(url, params));
    if (singleList.length > 0) {
      all.push(...singleList);
    }
  }
  return all;
}

export async function getAllResultsDateBased(url, { xToken } = {}) {
  const params = new URLSearchParams();
  params.set(XTOKEN_STRING, xToken);
  params.set(LIMIT_STRING, 40);
  let singleList = await apiRequest(applyParametersToURL(url, params));
  const all = singleList;
  while (singleList.length >= params.get(LIMIT_STRING)) {
    params.set(DATE_LIMIT_STRING, all.at(-1).datetime_created);
    singleList = await apiRequest(applyParametersToURL(url, params));
    if (singleList.length > 0) {
      const overlapIndex =
        singleList.findIndex((element) => element === all.at(-1)) + 1;
      if (overlapIndex < singleList.length) {
        const truncatedList = singleList.slice(overlapIndex);
        if (truncatedList.length > 0) {
          all.push(...truncatedList);
        }
      }
    }
  }
  return all;
}

export async function downloadProject(
  projectDownloadURL,
  { sbDownloaderOptions: options } = {}
) {
  let notDone = true;
  let project;
  while (notDone) {
    await limitRate(projectDownloadURL, { scrape: true });
    try {
      project = await downloadProjectFromURL(projectDownloadURL, options);
      notDone = false;
    } catch (error) {
      if (error.status === 503) {
        console.error(`Project may be broken: ${projectDownloadURL}`);
        project = {
          title: "Broken Project",
          type: "txt",
          arrayBuffer: Buffer.from(
            "This project failed to download from " +
              projectDownloadURL +
              " with a 503 error which may indicate that the projects is broken on Scratch." +
              "\nI'm not sure what causes this." +
              "\nAn example of a broken project can be found here: https://scratch.mit.edu/projects/958846" +
              "\nThe Scratch player crashes and claims that something went wrong." +
              "\nThese projects can't be downloaded as far as I know."
          ),
        };
        notDone = false;
      } else if (error.name === "CanNotAccessProjectError") {
        project = null;
        notDone = false;
      } else {
        console.error(
          `Error with project ${projectDownloadURL}: ${error.message}`
        );
        await sleep(60000);
      }
    }
  }

  return project;
}
