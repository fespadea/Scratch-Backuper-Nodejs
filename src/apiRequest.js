import fetch from "cross-fetch";
import Datastore from "@seald-io/nedb";
import * as helper from "./helperFunctions.js";
// import { RateLimiter } from "limiter";

export const XTOKEN_STRING = "x-token";
export const LIMIT_STRING = "limit";
export const OFFSET_STRING = "offset";
export const DATE_LIMIT_STRING = "dateLimit";

const CACHED_REQUESTS_PATH = "./cachedRequests/caschedRequests.db";
const cachedRequestsDB = new Datastore({
  filename: CACHED_REQUESTS_PATH,
  autoload: true,
});

let markedIDs = new Set();
let progressChecker = 0;
let lastCheckerTime = Date.now();

// TODO: Implement Rate Limiter
// const apiCallLimiter = new RateLimiter({
//   tokensPerInterval: 10,
//   interval: "second",
// });

/**
 *
 * @param {string} url
 * @param {object} options
 * @param {string} returnFunc
 * @param {object} data
 */
async function dumpAPIRequest(url, options, returnFunc, data) {
  const id = JSON.stringify({
    url: url,
    options: options,
    returnFunc: returnFunc,
  });
  const doc = {
    _id: id,
    data: data,
  };
  await cachedRequestsDB.insertAsync(doc);
}

/**
 *
 * @param {string} url
 * @param {object} options
 * @param {string} returnFunc
 * @returns
 */
async function loadAPIRequest(url, options, returnFunc) {
  const id = JSON.stringify({
    url: url,
    options: options,
    returnFunc: returnFunc,
  });
  const result = await cachedRequestsDB.findOneAsync({
    _id: id,
  });
  if (result === null) {
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
  return request.ok
    ? returnFunc === null
      ? request
      : returnFunc === "json" // eval is slow, so I hard coded in these functions that I actually use
      ? await request.json()
      : returnFunc === "text"
      ? await request.text()
      : await eval(`${Object.keys({ request })[0]}.${returnFunc}()`)
    : null; // usually just response.json()
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
  options,
  cache = true,
  returnFunc = "json"
) {
  const id =
    url +
    (options ? ` - ${JSON.stringify(options)}` : "") +
    (returnFunc === "json" ? "" : ` - {returnFunc: ${returnFunc}}`);

  if (cache) {
    const cachedData = await loadAPIRequest(url, options, returnFunc);
    if (cachedData !== undefined) {
      return cachedData;
    }

    if (id in markedIDs) {
      while (id in markedIDs) {
        await helper.sleep(1000);
      }
      return await loadAPIRequest(url, options, returnFunc);
    } else {
      markedIDs.add(id);
    }
  }

  let notDone = true;
  let request;
  while (notDone) {
    // await apiCallLimiter.removeTokens(1);
    try {
      request = await fetch(url, options);
      if (!request.ok && request.status !== 404) {
        throw new Error(`ConnectionError ${request.status} with url: ${id}`);
      } else {
        notDone = false;
      }
    } catch (error) {
      console.error(error);
      await helper.sleep(10000);
    }
  }
  const data = await applyReturnFunc(request, returnFunc);

  if (cache) {
    await dumpAPIRequest(url, options, returnFunc, data);
    markedIDs.delete(id);
  }

  if (++progressChecker % 100 === 0) {
    console.log(
      progressChecker +
        " requests in " +
        (lastCheckerTime - Date.now()) / 1000 +
        " seconds since last check."
    );
    lastCheckerTime = Date.now();
  }

  return data;
}

/**
 *
 * @param {string} url
 * @param {URLSearchParams} params
 * @returns
 */
export function applyParametersToURL(url, params) {
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
export async function getAllResults(url, xToken) {
  const params = new URLSearchParams();
  params.set(XTOKEN_STRING, xToken);
  const limit = 40;
  let offset = 0;
  params.set(LIMIT_STRING, limit);
  params.set(OFFSET_STRING, offset);
  let singleList = await apiRequest(applyParametersToURL(url, params));
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

export async function getAllResultsDateBased(url, xToken) {
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
