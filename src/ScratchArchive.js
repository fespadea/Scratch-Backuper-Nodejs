import { downloadProjectFromID } from "@turbowarp/sbdl";
import {
  ProjectAPI,
  StudioAPI,
  UserAPI,
  getSessionIDAndXToken,
  getXToken,
} from "./ScratchAPI.js";

// TODO: Handle 404 requests

/**
 * Error that gets thrown if a function that requires authorization is run
 * without a way to get said authorization
 */
class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthorizationError";
  }
}

class ScratchObject {
  _xToken;
  _sessionID;
  _password;

  /**
   * This function is async so I separated it out from the constructor. Gets
   * sessionID and xToken with password or xToken with sessionID. If you want to
   * remove authorization for some reason, pass null to each parameter.
   * @param {string} password
   * @param {string} sessionID
   * @param {string} xToken
   */
  async activateAuthorization(password, sessionID, xToken) {
    if (password !== undefined) this._password = password;
    if (this._password !== undefined) {
      loginData = await getSessionIDAndXToken(username, this._password);
      this._sessionID = loginData.sessionID;
      this._xToken = loginData.xToken;
    } else {
      if (sessionID !== undefined) this._sessionID = sessionID;
      if (this._sessionID !== undefined) {
        this._xToken = await getXToken(sessionID);
      } else {
        if (xToken !== undefined) this._xToken = xToken;
      }
    }
  }

  addData(data) {
    Object.assign(this, data);
  }

  constructor(baseData) {
    this.addData(baseData);
  }

  collectData() {
    for (const func of Object.getOwnPropertyNames(
      Object.getPrototypeOf(this)
    )) {
      if (func.search(/^add/) >= 0) {
        try {
          eval(`${func}()`);
        } catch (AuthorizationError) {}
      }
    }
  }

  addUser(userData, scratchArchive, password, sessionID, xToken) {
    scratchArchive.addUser(
      userData.username,
      userData,
      password,
      sessionID,
      xToken
    );
  }

  addProject(projectData, scratchArchive, xToken) {
    scratchArchive.addProject(
      projectData.projectID,
      projectData,
      projectData.username,
      xToken
    );
  }

  addStudio(studioData, scratchArchive) {
    scratchArchive.addProject(studioData.studioID, studioData);
  }

  async gatherMoreScratchObjects(scratchArchive) {
    for (const scratchDatas of Object.values(this)) {
    }
    const projectFunction = (projectData) => {
      this.addProject(
        projectData,
        scratchArchive,
        projectData.author.username === username ? this._xToken : undefined
      );
    };
    this.favorites.forEach(projectFunction);
    this.sharedProjects.forEach(projectFunction);
    this.unsharedProjects.forEach(projectFunction);
    this.trashedProjects.forEach(projectFunction);

    // don't bother passing any authorization tokens to another user since it
    // can't be the same user
    const userFunction = (userData) => {
      this.addUser(userData, scratchArchive);
    };
    this.followers.forEach(userFunction);
    this.following.forEach(userFunction);

    const studioFunction = (studioData) => {
      this.addStudio(studioData, scratchArchive);
    };
    this.curatedStudios.forEach(studioFunction);
    this.followedStudios.forEach(studioFunction);
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
class ScratchUser extends ScratchObject {
  /**
   *
   * @param {string} username
   * @param {object} [baseData={}]
   * @param {string} password
   * @param {string} sessionID
   * @param {string} xToken
   */
  constructor(username, baseData = {}, password, sessionID, xToken) {
    this.username = username;
    this._password = password;
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
      this.activateAuthorization();
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
      this.activateAuthorization();
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
class ScratchProject extends ScratchObject {
  _xToken;

  /**
   *
   * @param {string} projectID
   * @param {object} [baseData={}]
   * @param {string} username
   * @param {string} xToken
   */
  constructor(projectID, baseData, username, xToken) {
    this.id = projectID;
    this.username = username;
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
      this.username,
      this._xToken
    );
  }

  async addComments() {
    this.comments = await ProjectAPI.getComments(
      this.id,
      this.username,
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
    const project = await downloadProjectFromID(this.id, options);

    // TODO: Use Wayback machine as a backup

    if (project.title !== "" && !this.title) {
      this.title = project.title;
    }
    this.projectType = project.type;
    this.projectArrayBuffer = project.arrayBuffer;
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
class ScratchStudio extends ScratchObject {
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

export class ScratchArchiver {
  /**
   * Set up the arrays for the Scratch users, projects, and studios included in
   * this archive
   */
  constructor() {
    this.users = [];
    this.projects = [];
    this.studios = [];
  }

  addUser(username, baseData = {}, password, sessionID, xToken) {
    const userIndex = users.find((user) => user.username === username);
    if (userIndex) {
      user[userIndex].activateAuthorization(password, sessionID, xToken);
      return users[userIndex];
    }
    const user = new ScratchUser(
      username,
      baseData,
      password,
      sessionID,
      xToken
    );
    this.users.push(user);
    return user;
  }

  addProject(projectID, baseData, username, xToken) {
    const projectIndex = projects.find(
      (project) => project.projectID === projectID
    );
    if (projectIndex) {
      projects[projectIndex].activateAuthorization(xToken);
      return projects[projectIndex];
    }
    const project = new ScratchProject(projectID, baseData, username, xToken);
    this.projects.push(project);
    return project;
  }

  addStudio(studioID, baseData) {
    const studioIndex = studios.find((studio) => studio.studioID === studioID);
    if (studioIndex) {
      return studios[studioIndex];
    }
    const studio = new ScratchStudio(studioID, baseData);
    this.studios.push(studio);
    return studio;
  }

  collectData() {
    this.users.forEach((scratchObject) => scratchObject.collectData());
    this.projects.forEach((scratchObject) => scratchObject.collectData());
    this.studios.forEach((scratchObject) => scratchObject.collectData());
  }
}
