import { downloadProjectFromID } from "@turbowarp/sbdl";
import { ProjectAPI, StudioAPI, UserAPI } from "./ScratchAPI.js";

// TODO: Handle 404 requests by scraping Wayback Machine

/**
 * Error that gets thrown if a function that requires authorization is run
 * without a way to get said authorization
 */
export class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthorizationError";
  }
}

class ScratchObject {
  _xToken;
  _sessionID;

  _collected;
  _gathered;

  addData(data) {
    if (data && data.code !== "NotFound") {
      Object.assign(this, data);
    }
  }

  updateAuthorization(xToken, sessionID) {
    let authorizationUpdated = false;
    if (xToken && xToken !== this._xToken) {
      this._xToken = xToken;
      authorizationUpdated = true;
    }
    if (sessionID && sessionID !== this._sessionID) {
      this._sessionID = sessionID;
      authorizationUpdated = true;
    }
    if (authorizationUpdated) {
      this._collected = false;
      this._gathered = false;
    }
    return authorizationUpdated;
  }

  constructor(baseData) {
    this.addData(baseData);
    this._collected = false;
    this._gathered = false;
  }

  collectData() {
    if (this._collected) return;

    for (const func of Object.getOwnPropertyNames(
      Object.getPrototypeOf(this)
    )) {
      if (func.search(/^add/) >= 0) {
        try {
          eval(`await this.${func}()`);
        } catch (AuthorizationError) {}
      }
    }

    this._collected = true;
    this._gathered = false;
  }

  async gatherMoreScratchObjects(scratchArchive) {
    if (this._gathered) {
      return;
    }

    const determineScratchType = (data) => {
      if ("scratchteam" in data) {
        scratchArchive.addUser(userData.username, userData);
      } else if ("host" in data) {
        scratchArchive.addProject(
          projectData.projectID,
          projectData,
          projectData.username
        );
      } else if ("author" in data || "creator_id" in data) {
        scratchArchive.addProject(studioData.studioID, studioData);
      }
    };

    for (const scratchDatas of Object.values(this)) {
      if (Array.isArray(scratchDatas)) {
        scratchDatas.forEach(determineScratchType);
      } else {
        determineScratchType(scratchDatas);
      }
    }

    this._gathered = true;
  }
}

/* urls to include
user page
/projects + pages
/favorites + pages
/studios_following + pages
/studios + pages
/following + pages
/followers + pages
*/
export class ScratchUser extends ScratchObject {
  /**
   *
   * @param {string} username
   * @param {object} [baseData={}]
   * @param {string} sessionID
   * @param {string} xToken
   */
  constructor(username, baseData = {}, sessionID, xToken) {
    this.username = username;
    this._sessionID = sessionID;
    this._xToken = xToken;
    super(baseData);
  }

  async addUserInfo() {
    const userData = await UserAPI.getUserInfo(this.username);
    this.addData(userData);
  }

  async addFavorites() {
    this.favorites = await UserAPI.getFavorites(this.username);
  }

  async addFollowers() {
    this.followers = await UserAPI.getFollowers(this.username);
  }

  async addFollowing() {
    this.following = await UserAPI.getFollowing(this.username);
  }

  async addCuratedStudios() {
    this.curatedStudios = await UserAPI.getCuratedStudios(this.username);
  }

  async addSharedProjects() {
    this.sharedProjects = await UserAPI.getSharedProjects(this.username);
  }

  async addUnsharedProjects() {
    if (this._sessionID === undefined || this._xToken === undefined) {
      if (this._sessionID === undefined) {
        throw new AuthorizationError(
          "ScratchUser.addUnsharedProjects requires that sessionID or password be provided to this object."
        );
      }
    }

    this.unsharedProjects = await UserAPI.getUnsharedProjects(
      this._sessionID,
      this._xToken
    );
  }

  async addTrashedProjects() {
    if (this._sessionID === undefined || this._xToken === undefined) {
      if (this._sessionID === undefined) {
        throw new AuthorizationError(
          "ScratchUser.addTrashedProjects requires that sessionID or password be provided to this object."
        );
      }
    }

    this.trashedProjects = await UserAPI.getTrashedProjects(
      this._sessionID,
      this._xToken
    );
  }

  async addProfileComments() {
    this.profileComments = await UserAPI.getProfileComments(this.username);
  }

  async addFollowedStudios() {
    this.followedStudios = await UserAPI.getFollowedStudios(this.username);
  }
}

/* urls to include
project page
/remixTree
/remixes
/studios
*/
// add support to get data on parent remix (project that this project originally remixed, if applicable)
export class ScratchProject extends ScratchObject {
  /**
   *
   * @param {string} projectID
   * @param {object} [baseData={}]
   * @param {string} username
   * @param {string} xToken
   */
  constructor(projectID, baseData, username, xToken) {
    this.id = projectID;
    this.author.username = username;
    this._xToken = xToken;
    this.addData(baseData);
  }

  async addProjectInfo() {
    const projectData = ProjectAPI.getProjectInfo(this.id, this._xToken);
    this.addData(projectData);
  }

  async addRemixes() {
    this.remixes = await ProjectAPI.getRemixes(this.id, this._xToken);
  }

  async addStudios() {
    this.studios = await ProjectAPI.getStudios(
      this.id,
      this.author.username,
      this._xToken
    );
  }

  async addComments() {
    this.comments = await ProjectAPI.getComments(
      this.id,
      this.author.username,
      this._xToken
    );
  }

  async addProject() {
    const options = {
      // May be called periodically with progress updates.
      onProgress: (type, loaded, total) => {
        // type is 'metadata', 'project', 'assets', or 'compress'
        console.log(type, loaded / total);
      },
    };
    const project = {};
    try {
      project = await downloadProjectFromID(this.id, options);
    } catch (canNotAccessProjectError) {
      if (canNotAccessProjectError.name !== "CanNotAccessProjectError")
        throw canNotAccessProjectError;

      try {
        project = await ProjectAPI.getProjectFromWaybackMachine(this.id);
      } catch (canNotAccessProjectError) {
        if (canNotAccessProjectError.name !== "CanNotAccessProjectError")
          throw canNotAccessProjectError;
        return;
      }
    }

    if (project) {
      if (project.title !== "" && !this.title) {
        this.title = project.title;
      }
      this.projectType = project.type;
      this.projectArrayBuffer = project.arrayBuffer;
    }
  }

  /**
   * Exclude the project array buffer because it is unreadable by humans, and
   * because we will provide a way to output the project as a Scratch file
   * instead.
   * @returns data in object excluding the project Array Buffer
   */
  toJSON() {
    const data = {};
    for (const property in this) {
      if (property !== "projectArrayBuffer") {
        data[property] = this[property];
      }
    }
    return data;
  }
}

/* urls to include
studio page
/comments
/curators
/activity
*/
export class ScratchStudio extends ScratchObject {
  /**
   *
   * @param {string} studioID
   * @param {object} baseData
   */
  constructor(studioID, baseData) {
    this.id = studioID;
    super(baseData);
  }

  async addStudioInfo() {
    const studioData = StudioAPI.getStudioInfo(this.id);
    this.addData(studioData);
  }

  async addActivity() {
    this.activity = await StudioAPI.getActivity(this.id);
  }

  async addComments() {
    this.comments = await StudioAPI.getComments(this.id);
  }

  async addCurators() {
    this.curators = await StudioAPI.getCurators(this.id);
  }

  async addManagers() {
    this.managers = await StudioAPI.getManagers(this.id);
  }

  async addProjects() {
    this.projects = await StudioAPI.getProjects(this.id);
  }
}
