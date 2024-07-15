import {
  apiRequest,
  applyParametersToURL,
  downloadProject,
  getAllResults,
  getAllResultsDateBased,
  limitRate,
  PROJECT_TOKEN_STRING,
  XTOKEN_STRING,
} from "./apiRequest.js";
import { JSDOM } from "jsdom";
import he from "he";
import { ScratchProject } from "./ScratchClasses.js";

const SCRATCH_API = "https://api.scratch.mit.edu";
const USER_API = SCRATCH_API + "/users/";
const PROJECT_API = SCRATCH_API + "/projects/";
const STUDIO_API = SCRATCH_API + "/studios/";

const SCRATCH_SITE_API = "https://scratch.mit.edu/site-api";
const SCRATCH_SITE = "https://scratch.mit.edu";
// API acted inconsistent if I didn't include a timestamp
const WAYBACK_MACHINE_AVAILABILITY_API =
  "https://archive.org/wayback/available?timestamp=0&url=";
const SCRATCH_PROJECT_DOWNLOAD_API = "https://projects.scratch.mit.edu/";

let cachedXTokenAndSessionID = {};

/**
 * Error that gets thrown if a project api request that requires a username is
 * unable to acquire said username
 */
export class ProjectUsernameError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProjectUsernameError";
  }
}

export async function getSessionIDAndXToken(username, password) {
  if (!(username in cachedXTokenAndSessionID)) {
    const options = {
      headers: {
        "x-csrftoken": "a",
        "x-requested-with": "XMLHttpRequest",
        Cookie: "scratchcsrftoken=a;scratchlanguage=en;",
        referer: "https://scratch.mit.edu",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.101 Safari/537.36",
      },
      method: "POST",
      body: JSON.stringify({ username: username, password: password }),
    };

    const request = await apiRequest(
      "https://scratch.mit.edu/login/",
      options,
      false,
      null
    );

    const xToken = (await request.json())[0].token;
    const sessionID = request.headers.get("set-cookie").match(/\"(.*)\"/)[0];

    cachedXTokenAndSessionID[username] = {
      xToken: xToken,
      sessionID: sessionID,
    };
  }

  return cachedXTokenAndSessionID[username];
}

export async function getXToken(sessionID) {
  const cachedValues = Object.values(cachedXTokenAndSessionID).find(
    (cachedValues) => cachedValues.sessionID === sessionID
  );
  if (cachedValues) {
    return cachedValues.xToken;
  }

  const options = {
    headers: {
      cookie: `scratchsessionsid=${sessionID}`,
      "X-Requested-With": "XMLHttpRequest",
    },
  };
  const request = await apiRequest(
    "https://scratch.mit.edu/session/",
    options,
    false
  );
  return request.user.token;
}

export class UserAPI {
  static async getUserInfo(username) {
    return await apiRequest(USER_API + username);
  }

  static async getFavorites(username) {
    return await getAllResults(USER_API + username + "/favorites");
  }

  static async getFollowers(username) {
    return await getAllResults(USER_API + username + "/followers");
  }

  static async getFollowing(username) {
    return await getAllResults(USER_API + username + "/following");
  }

  static async getCuratedStudios(username) {
    return await getAllResults(USER_API + username + "/studios/curate");
  }

  static async getSharedProjects(username) {
    return await getAllResults(USER_API + username + "/projects");
  }

  static async #getSiteAPIProjects(sessionID, siteApiAddition, xToken) {
    const options = {
      headers: {
        Cookie: `scratchcsrftoken=a; scratchlanguage=en; scratchsessionsid=${sessionID}`,
      },
    };
    const unsharedProjects = await apiRequest(
      SCRATCH_SITE_API + siteApiAddition,
      options
    );
    if (xToken === undefined) {
      xToken = getXToken(sessionID);
    }
    for (let i = 0; i < unsharedProjects.length; i++) {
      const projectID = unsharedProjects[i].pk;
      console.log(xToken);
      unsharedProjects[i] = await ProjectAPI.getProjectInfo(projectID, xToken);
    }
    return unsharedProjects;
  }

  static async getUnsharedProjects(sessionID, xToken) {
    return this.#getSiteAPIProjects(sessionID, "/projects/notshared/", xToken);
  }

  static async getTrashedProjects(sessionID, xToken) {
    return this.#getSiteAPIProjects(sessionID, "/projects/trashed/", xToken);
  }

  static async getProfileComments(username) {
    const comments = [];
    let pageNumber = 1;
    let commentElements;
    do {
      const text = await apiRequest(
        SCRATCH_SITE_API +
          "/comments/user/" +
          username +
          "/?page=" +
          pageNumber++,
        {},
        true,
        "text"
      );
      const commentsDoc = new JSDOM(text).window.document;
      commentElements = commentsDoc.getElementsByClassName("top-level-reply");
      for (const commentElement of commentElements) {
        const comment = await CommentAPI.convertCommentElementToObject(
          commentElement
        );
        comments.push(comment);
      }
    } while (commentElements.length > 0);

    return comments;
  }

  static async getFollowedStudios(username) {
    const followedStudios = [];
    let pageNumber = 1;
    let text;
    do {
      text = await apiRequest(
        SCRATCH_SITE +
          "/users/" +
          username +
          "/studios_following/?page=" +
          pageNumber++,
        {
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
        },
        true,
        "text"
      );
      const studiosDoc = new JSDOM(text).window.document;
      const studioElements = studiosDoc.getElementsByClassName("title");
      for (const studioElement of studioElements) {
        const studioIDRegex = /studios\/([0-9]+)\//;
        const studioLink = studioElement.querySelector("a");
        const studioID = studioLink
          .getAttribute("href")
          .match(studioIDRegex)[1];
        const followedStudio = await StudioAPI.getStudioInfo(studioID);
        followedStudios.push(followedStudio);
      }
    } while (text !== null);

    return followedStudios;
  }
}

export class ProjectAPI {
  static async getProjectInfo(projectID, xToken, cache = true) {
    const params = new URLSearchParams();
    params.set(XTOKEN_STRING, xToken);
    return await apiRequest(
      applyParametersToURL(PROJECT_API + projectID, params),
      undefined,
      cache
    );
  }

  static async getRemixes(projectID, xToken) {
    return await getAllResults(PROJECT_API + projectID + "/remixes", xToken);
  }

  static async #handleUsernameURL(projectID, username, xToken) {
    if (username === undefined) {
      const projectInfo = await this.getProjectInfo(projectID, xToken);
      if (projectInfo && projectInfo.author) {
        username = projectInfo.author.username;
      } else {
        throw new ProjectUsernameError(
          "Unable to get author's username for api request that requires the project author's username."
        );
      }
    }
    return USER_API + username + "/projects/";
  }

  static async getStudios(projectID, username, xToken) {
    return await getAllResults(
      (await ProjectAPI.#handleUsernameURL(projectID, username, xToken)) +
        projectID +
        "/studios",
      xToken
    );
  }

  static async getComments(projectID, username, xToken) {
    return await CommentAPI.getCommentsWithReplies(
      (await ProjectAPI.#handleUsernameURL(projectID, username, xToken)) +
        projectID +
        "/comments",
      xToken
    );
  }

  static async getProjectToken(projectID, xToken) {
    const projectData = await this.getProjectInfo(projectID, xToken, false);
    if (projectData) return projectData.project_token;
    else return undefined;
  }

  static async getProjectFromScratch(projectID, options, xToken) {
    const getURLWithParams = async (url) => {
      const params = new URLSearchParams();
      params.set(
        PROJECT_TOKEN_STRING,
        await ProjectAPI.getProjectToken(projectID, xToken)
      );
      return applyParametersToURL(url, params);
    };

    return await downloadProject(
      SCRATCH_PROJECT_DOWNLOAD_API + projectID,
      options,
      getURLWithParams
    );

    // while (true) {
    //   await limitRate("http://projects.scratch.mit.edu/", true);
    //   try {
    //     return await downloadProjectFromID(projectID, options);
    //   } catch (error) {
    //     if (error.name !== "CanNotAccessProjectError") {
    //       console.error(`Error with projectID ${projectID}: ${error.message}`);
    //       await sleep(60000);
    //     } else {
    //       return undefined;
    //     }
    //   }
    // }
  }

  static async getProjectWaybackAvailability(projectID) {
    return await apiRequest(
      WAYBACK_MACHINE_AVAILABILITY_API +
        SCRATCH_PROJECT_DOWNLOAD_API +
        projectID
    );
  }

  static async getProjectFromWaybackMachine(projectID, options) {
    const availabilityRequest = await ProjectAPI.getProjectWaybackAvailability(
      projectID
    );

    if (
      availabilityRequest.archived_snapshots &&
      availabilityRequest.archived_snapshots.closest
    ) {
      const url = availabilityRequest.archived_snapshots.closest.url.replace(
        "/" + SCRATCH_PROJECT_DOWNLOAD_API,
        "_if/" + SCRATCH_PROJECT_DOWNLOAD_API
      );
      return await downloadProject(url, options);
      // while (true) {
      //   await limitRate(url, true);
      //   try {
      //     return await downloadProjectFromURL(url, options);
      //   } catch (error) {
      //     if (error.name !== "CanNotAccessProjectError") {
      //       console.error(`Error with url ${url}: ${error.message}`);
      //       await sleep(60000);
      //     } else {
      //       return undefined;
      //     }
      //   }
      // }
    }
  }
}

export class StudioAPI {
  static async getStudioInfo(studioID) {
    return await apiRequest(STUDIO_API + studioID);
  }

  static async getActivity(studioID) {
    return await getAllResultsDateBased(STUDIO_API + studioID + "/activity");
  }

  static async getComments(studioID) {
    return await CommentAPI.getCommentsWithReplies(
      STUDIO_API + studioID + "/comments"
    );
  }

  static async getCurators(studioID) {
    return await getAllResults(STUDIO_API + studioID + "/curators");
  }

  static async getManagers(studioID) {
    return await getAllResults(STUDIO_API + studioID + "/managers");
  }

  static async getProjects(studioID) {
    return await getAllResults(STUDIO_API + studioID + "/projects");
  }
}

class CommentAPI {
  static async convertCommentElementToObject(commentElement) {
    const comment = {};
    const reply = commentElement.getAttribute("class") !== "top-level-reply";
    const commentNode = commentElement.querySelector(".comment ");
    comment.id = commentNode.getAttribute("data-comment-id");

    if (reply) {
      const replyNode = commentNode.querySelector(".reply");
      comment.parent_id = replyNode.getAttribute("data-parent-thread");
      comment.commentee_id = replyNode.getAttribute("data-commentee-id");
    } else {
      comment.parent_id = null;
      comment.commentee_id = null;
    }

    const contentNode = commentNode.querySelector(".content");
    const preStrippedComment = contentNode.textContent;
    const preCommentRegex = reply
      ? /\n\s+\n\s+@\S+\n\s+\n\s+\n\s+/
      : /\n\s+\n\s+\n\s+/;
    const postCommentRegex = /\n\s+\n\s+$/;
    const strippedComment = preStrippedComment
      .replace(preCommentRegex, "")
      .replace(postCommentRegex, "");
    comment.content = he.encode(strippedComment, { useNamedReferences: true }); // this is to match how this text is represented in the API

    const timeNode = commentNode.querySelector(".time");
    comment.datetime_created = new Date(timeNode.getAttribute("title"));
    comment.datetime_modified = comment.datetime_modified; // there doesn't seem to be a way to see if this is different from creation date

    comment.visibility = "visible"; // I'm just assuming this to be true since it was returned by the api without any authorization

    const authorNode = commentNode.querySelector("#comment-user");
    const authorName = authorNode.getAttribute("data-comment-user");
    const image = authorNode.querySelector(".avatar").getAttribute("src");
    comment.author = {
      username: authorName,
      image: image,
    };
    const authorData = await UserAPI.getUserInfo(authorName);
    if (authorData) {
      comment.author.id = authorData.id;
      comment.author.scratchteam = authorData.scratchteam;
    }

    const replies = commentElement.getElementsByTagName("li");
    comment.reply_count = reply ? 0 : replies.length;

    if (!reply) {
      comment.replies = [];
      for (const reply of replies) {
        comment.replies.push(await this.convertCommentElementToObject(reply));
      }
    }

    return comment;
  }

  static async getCommentsWithReplies(url, xToken) {
    const comments = await getAllResults(url, xToken);
    for (const comment of comments) {
      comment.replies = getAllResults(`${url}/${comment.id}/replies`, xToken);
    }
    const resolvedReplies = await Promise.all(
      comments.map((comment) => comment.replies)
    );
    for (let i = 0; i < comments.length; i++) {
      comments[i].replies = resolvedReplies[i];
    }
    return comments;
  }
}
