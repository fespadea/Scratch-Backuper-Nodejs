import {
  ScratchProject,
  ScratchUser,
  ScratchStudio,
} from "./ScratchClasses.js";
import { getSessionIDAndXToken, getXToken } from "./ScratchAPI.js";
import {
  dumpJSON,
  dumpProject,
  getValidFilename,
  getValidFolderName,
} from "./helperFunctions.js";

const DEFAULT_ARCHIVE_PATH = "./ScratchArchive/";

export class ScratchArchive {
  #authorizations;

  /**
   * Set up the arrays for the Scratch users, projects, and studios included in
   * this archive
   * Also, set up the array for any authorizations provided.
   */
  constructor() {
    this.users = [];
    this.projects = [];
    this.studios = [];
    this.#authorizations = {};
    this.userIDToNames = {};
    this.projectIDToTitles = {};
    this.studioIDToTitles = {};
  }

  /**
   *
   * @param {string} username
   * @param {string} [password=]
   * @param {string} [xToken=]
   * @param {string} [sessionID=]
   */
  async logIn(username, password, xToken, sessionID) {
    const authData = { xToken, sessionID };
    if (password && !sessionID) {
      const loginData = await getSessionIDAndXToken(username, password);
      authData.sessionID = loginData.sessionID;
      authData.xToken = loginData.xToken;
    } else if (sessionID && !xToken) {
      authData.xToken = await getXToken(sessionID);
    }
    this.#authorizations[username] = authData;
    // TODO: update objects already in archive with new authorization
    // information if applicable (use updateAuthorization function from
    // ScratchObject class)
  }

  getAuthorization(username) {
    return username in this.#authorizations
      ? this.#authorizations[username]
      : {};
  }

  addUser(username, baseData = {}, level) {
    const userIndex = this.users.findIndex(
      (user) => user.username === username
    );
    if (level !== undefined) baseData["_level"] = level;
    if (userIndex >= 0) {
      this.users[userIndex].addData(baseData);
      return this.users[userIndex];
    } else {
      const authData = this.getAuthorization(username);
      const user = new ScratchUser(
        username,
        baseData,
        authData.sessionID,
        authData.xToken
      );
      this.users.push(user);
      return user;
    }
  }

  addProject(projectID, baseData = {}, username, level) {
    if (!username)
      username = baseData.author ? baseData.author.username : baseData.username;
    const projectIndex = this.projects.findIndex(
      (project) => project.projectID === projectID
    );
    if (level !== undefined) baseData["_level"] = level;
    if (projectIndex >= 0) {
      this.projects[projectIndex].addData(baseData);
      return this.projects[projectIndex];
    } else {
      const authData = this.getAuthorization(username);
      const project = new ScratchProject(
        projectID,
        baseData,
        username,
        authData.xToken
      );
      this.projects.push(project);
      return project;
    }
  }

  addStudio(studioID, baseData = {}, level) {
    const studioIndex = this.studios.findIndex(
      (studio) => studio.studioID === studioID
    );
    if (level !== undefined) baseData["_level"] = level;
    if (studioIndex >= 0) {
      this.studios[studioIndex].addData(baseData);
      return this.studios[studioIndex];
    } else {
      const studio = new ScratchStudio(studioID, baseData);
      this.studios.push(studio);
      return studio;
    }
  }

  // add store as you go with options (accept bool and path)
  async collectData() {
    await Promise.all(
      this.users
        .concat(this.projects)
        .concat(this.studios)
        .map((scratchObject) => scratchObject.collectData())
    );
  }

  gatherFromScratchObject(scratchObject) {
    const gatheredObjects = scratchObject.gatherObjects();
    gatheredObjects.gatheredUsers.forEach(
      (user) => this.addUser(user.username, user),
      this
    );
    gatheredObjects.gatheredProjects.forEach(
      (project) => this.addProject(project.id, project),
      this
    );
    gatheredObjects.gatheredStudios.forEach(
      (studio) => this.addStudio(studio.id, studio),
      this
    );
  }

  gatherScratchObjects() {
    this.users.forEach(this.gatherFromScratchObject, this);
    this.projects.forEach(this.gatherFromScratchObject, this);
    this.studios.forEach(this.gatherFromScratchObject, this);
  }

  async completeDataSweeps(numSweeps = -1) {
    let collectDataPromise = this.collectData();
    if (numSweeps === -1) {
      numSweeps = Math.max(
        ...this.users
          .concat(this.projects)
          .concat(this.studios)
          .map((scratchObject) => scratchObject.getLevel())
      );
    }
    for (let i = 0; i < numSweeps; i++) {
      await collectDataPromise;
      this.gatherScratchObjects();
      collectDataPromise = this.collectData();
    }
    await collectDataPromise;
  }

  getUsernameFromID(userID) {
    if (userID in this.userIDToNames) {
      return this.userIDToNames[userID];
    } else {
      return `${userID} -Unable to Acquire Username-`;
    }
  }

  getProjectTitleFromID(projectID) {
    if (projectID in this.projectIDToTitles) {
      return this.projectIDToTitles[projectID];
    } else {
      return `${projectID} -Unable to Acquire Project Title-`;
    }
  }

  getStudioTitleFromID(studioID) {
    if (studioID in this.studioIDToTitles) {
      return this.studioIDToTitles[studioID];
    } else {
      return `${studioID} -Unable to Acquire Studio Title-`;
    }
  }

  async storeUser(user, path = DEFAULT_ARCHIVE_PATH) {
    const username = user.username
      ? user.username
      : this.getUsernameFromID(user.id);
    await dumpJSON(
      user,
      `${path}${getValidFolderName(username)}/${getValidFilename(
        username
      )}.json`
    );
  }

  async storeProject(project, path = DEFAULT_ARCHIVE_PATH) {
    console.log(project);
    const username = project.username
      ? project.username
      : project.author.username
      ? project.author.username
      : this.getUsernameFromID(project.author.id);
    const projectTitle = project.title
      ? project.title
      : this.getProjectTitleFromID(project.id);
    const projectFolder = `${path}${getValidFolderName(
      username
    )}/projects/${getValidFolderName(projectTitle)}/`;
    await Promise.all([
      dumpJSON(
        project,
        projectFolder + `${getValidFilename(projectTitle)}.json`
      ),
      dumpProject(project.project, projectFolder),
      dumpProject(project.waybackProject, projectFolder),
    ]);
  }

  async storeStudio(studio, path = DEFAULT_ARCHIVE_PATH) {
    const username =
      studio.managers && studio.managers.length > 0
        ? studio.managers[0].username
        : this.getUsernameFromID(studio.host);
    const studioTitle = studio.title
      ? studio.title
      : this.getStudioTitleFromID(studio.id);
    await dumpJSON(
      studio,
      `${path}${getValidFolderName(username)}/studios/${getValidFolderName(
        studioTitle
      )}/${getValidFilename(studioTitle)}.json`
    );
  }

  findIDToNameConversions() {
    const gatherFromScratchObject = (scratchObject) =>
      scratchObject.gatherObjects(false);
    const gatheredFromUsers = this.users.map(gatherFromScratchObject);
    const gatheredFromProjects = this.projects.map(gatherFromScratchObject);
    const gatheredFromStudios = this.studios.map(gatherFromScratchObject);

    const gatheredUsers = [
      gatheredFromUsers.gatheredUsers,
      gatheredFromProjects.gatheredUsers,
      gatheredFromStudios.gatheredUsers,
    ].flat(2);
    const gatheredProjects = [
      gatheredFromUsers.gatheredProjects,
      gatheredFromProjects.gatheredProjects,
      gatheredFromStudios.gatheredProjects,
    ].flat(2);
    const gatheredStudios = [
      gatheredFromUsers.gatheredStudios,
      gatheredFromProjects.gatheredStudios,
      gatheredFromStudios.gatheredStudios,
    ].flat(2);

    [...this.users, ...gatheredUsers].forEach((user) => {
      if (user && user.id && user.username) {
        this.userIDToNames[user.id] = user.username;
      }
    });
    [...this.projects, ...gatheredProjects].forEach((project) => {
      if (project && project.id && project.title) {
        this.projectIDToTitles[project.id] = project.title;
      }
    });
    [...this.studios, ...gatheredStudios].forEach((studio) => {
      if (studio && studio.id && studio.title) {
        this.studioIDToTitles[studio.id] = studio.title;
      }
    });
  }

  /**
   *
   * @param {string} path
   */
  async storeData(path = DEFAULT_ARCHIVE_PATH) {
    this.findIDToNameConversions();

    await Promise.all(
      this.users.map((user) => this.storeUser(user, path), this),
      this.projects.map((project) => this.storeProject(project, path), this),
      this.studios.map((studio) => this.storeStudio(studio, path), this)
    );
  }
}
