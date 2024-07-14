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
import { getFolders } from "./helperFunctions.js";
import { loadJSONs } from "./helperFunctions.js";
import { loadProjects } from "./helperFunctions.js";
import { moveFile } from "./helperFunctions.js";
import { isDirectory } from "./helperFunctions.js";
import { getItemsInFolder } from "./helperFunctions.js";

const DEFAULT_ARCHIVE_PATH = "./ScratchArchive/";
const PROJECTS_FOLDER = "/projects/";
const STUDIOS_FOLDER = "/studios/";

const MISSING_USERNAME_INDICATOR = "-Unable to Acquire Username-";
const MISSING_PROJECT_TILE_INDICATOR = "-Unable to Acquire Project Title-";
const MISSING_STUDIO_TITLE_INDICATOR = "-Unable to Acquire Studio Title-";
const UNKNOWN_USER_INDICATOR = "-Unable to Identify User-";

export class ScratchArchive {
  #authorizations;

  /**
   * Set up the arrays for the Scratch users, projects, and studios included in
   * this archive
   * Also, set up the array for any authorizations provided.
   */
  constructor(archivePath = DEFAULT_ARCHIVE_PATH) {
    this.users = [];
    this.projects = [];
    this.studios = [];
    this.#authorizations = {};
    this.userIDToNames = {};
    this.projectIDToTitles = {};
    this.studioIDToTitles = {};
    this.storePromises = [];
    this.archivePath = archivePath;
    this.foundIDToNameConversions = false;
  }

  setArchivePath(newArchivePath) {
    this.archivePath = newArchivePath;
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
  }

  getAuthorization(username) {
    return username in this.#authorizations
      ? this.#authorizations[username]
      : {};
  }

  addUser(username, baseData = {}, level) {
    if (username === undefined) username = baseData["username"];
    const userIndex = this.users.findIndex(
      (user) => user.username === username
    );
    if (level !== undefined) baseData["_level"] = level;
    if (userIndex >= 0) {
      this.users[userIndex].addData(baseData);
      return this.users[userIndex];
    }
    const authData = this.getAuthorization(username);
    const user = new ScratchUser(
      username,
      baseData,
      authData.sessionID,
      authData.xToken
    );
    this.users.push(user);
    this.foundIDToNameConversions = false;
    return user;
  }

  addProject(projectID, baseData = {}, username, level) {
    if (projectID === undefined) projectID = baseData["id"];
    if (!username)
      username = baseData.author ? baseData.author.username : baseData.username;
    const projectIndex = this.projects.findIndex(
      (project) => project.projectID === projectID
    );
    if (level !== undefined) baseData["_level"] = level;
    if (projectIndex >= 0) {
      this.projects[projectIndex].addData(baseData);
      return this.projects[projectIndex];
    }
    const authData = this.getAuthorization(username);
    const project = new ScratchProject(
      projectID,
      baseData,
      username,
      authData.xToken
    );
    this.projects.push(project);
    this.foundIDToNameConversions = false;
    return project;
  }

  addStudio(studioID, baseData = {}, level) {
    if (studioID === undefined) studioID = baseData["id"];
    const studioIndex = this.studios.findIndex(
      (studio) => studio.studioID === studioID
    );
    if (level !== undefined) baseData["_level"] = level;
    if (studioIndex >= 0) {
      this.studios[studioIndex].addData(baseData);
      return this.studios[studioIndex];
    }
    const studio = new ScratchStudio(studioID, baseData);
    this.studios.push(studio);
    this.foundIDToNameConversions = false;
    return studio;
  }

  async collectData(storeAsYouGo = false) {
    await Promise.all(
      this.users
        .concat(this.projects)
        .concat(this.studios)
        .map(async (scratchObject) => {
          const didCollectData = await scratchObject.collectData();
          if (didCollectData && storeAsYouGo)
            this.storePromises.push(
              this.storeScratchObject(scratchObject, this.archivePath)
            );
        })
    );
    this.foundIDToNameConversions = false;
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

  async completeDataSweeps(storeAsYouGo = false, numSweeps = -1) {
    let collectDataPromise = this.collectData(storeAsYouGo);
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
      collectDataPromise = this.collectData(storeAsYouGo);
    }
    await collectDataPromise;
    if (storeAsYouGo) {
      await Promise.all(this.storePromises);
    }
  }

  getUsernameFromID(userID) {
    if (userID in this.userIDToNames) {
      return this.userIDToNames[userID];
    } else {
      return MISSING_USERNAME_INDICATOR;
    }
  }

  getProjectTitleFromID(projectID) {
    if (projectID in this.projectIDToTitles) {
      return this.projectIDToTitles[projectID];
    } else {
      return MISSING_PROJECT_TILE_INDICATOR;
    }
  }

  getStudioTitleFromID(studioID) {
    if (studioID in this.studioIDToTitles) {
      return this.studioIDToTitles[studioID];
    } else {
      return MISSING_STUDIO_TITLE_INDICATOR;
    }
  }

  getIDAddition(scratchObject) {
    if (scratchObject.id) return ` {${scratchObject.id}}`;
    else return "";
  }

  getUserFileName(user, includeIDAddition = false) {
    let username = user.username
      ? user.username
      : this.getUsernameFromID(user.id);
    if (includeIDAddition || username === MISSING_USERNAME_INDICATOR)
      username += this.getIDAddition(user);
    return getValidFilename(username);
  }

  getUserParentPath(user) {
    return (
      this.archivePath +
      getValidFolderName(`${this.getUserFileName(user, true)}`) +
      "/"
    );
  }

  getUserPath(user) {
    return this.getUserParentPath(user) + this.getUserFileName(user);
  }

  async storeUser(user) {
    await dumpJSON(user, `${this.getUserPath(user)}.json`);
  }

  getProjectFileName(project, includeIDAddition = false) {
    let projectTitle = project.title
      ? project.title
      : this.getProjectTitleFromID(project.id);
    if (includeIDAddition || projectTitle === MISSING_PROJECT_TILE_INDICATOR)
      projectTitle += this.getIDAddition(project);
    return getValidFilename(projectTitle);
  }

  getProjectParentPath(project) {
    const userParentPath = this.getUserParentPath(
      project.username
        ? { username: project.username, id: project.creator_id }
        : project.author
        ? project.author.username
          ? project.author
          : {
              username: this.getUsernameFromID(project.author.id),
              id: project.author.id,
            }
        : { username: UNKNOWN_USER_INDICATOR }
    );
    return (
      userParentPath +
      PROJECTS_FOLDER +
      getValidFolderName(`${this.getProjectFileName(project, true)}`) +
      "/"
    );
  }

  getProjectPath(project) {
    return (
      this.getProjectParentPath(project) + this.getProjectFileName(project)
    );
  }

  async storeProject(project) {
    const projectPath = this.getProjectPath(project);
    await Promise.all([
      dumpJSON(project, `${projectPath}.json`),
      dumpProject(project._project, projectPath),
      dumpProject(project._waybackProject, projectPath),
    ]);
  }

  getStudioFileName(studio, includeIDAddition = false) {
    let studioTitle = studio.title
      ? studio.title
      : this.getStudioTitleFromID(studio.id);
    if (includeIDAddition || studioTitle === MISSING_STUDIO_TITLE_INDICATOR)
      studioTitle += this.getIDAddition(studio);
    return getValidFilename(studioTitle);
  }

  getStudioParentPath(studio) {
    const userParentPath = this.getUserParentPath(
      studio.managers && studio.managers.length > 0
        ? studio.managers[0]
        : studio.host
        ? { username: this.getUsernameFromID(studio.host), id: studio.host }
        : { username: UNKNOWN_USER_INDICATOR }
    );
    return (
      userParentPath +
      STUDIOS_FOLDER +
      getValidFolderName(`${this.getStudioFileName(studio, true)}`) +
      "/"
    );
  }

  getStudioPath(studio) {
    return this.getStudioParentPath(studio) + this.getStudioFileName(studio);
  }

  async storeStudio(studio) {
    await dumpJSON(studio, `${this.getStudioPath(studio)}.json`);
  }

  async storeScratchObject(scratchObject) {
    if (scratchObject instanceof ScratchUser) {
      this.storeUser(scratchObject);
    } else if (scratchObject instanceof ScratchProject) {
      this.storeProject(scratchObject);
    } else if (scratchObject instanceof ScratchStudio) {
      this.storeStudio(scratchObject);
    }
  }

  findIDToNameConversions() {
    if (this.foundIDToNameConversions) return;
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
    this.foundIDToNameConversions = true;
  }

  async storeArchive() {
    this.findIDToNameConversions();

    await Promise.all(
      this.users.map((user) => this.storeUser(user), this),
      this.projects.map((project) => this.storeProject(project), this),
      this.studios.map((studio) => this.storeStudio(studio), this)
    );
  }

  getObjectsWithoutLevels() {
    return this.users
      .concat(this.projects)
      .concat(this.studios)
      .filter((scratchObject) => scratchObject.getLevel() === undefined);
  }

  applyLevelToObjectsWithoutLevels(level = 0) {
    this.getObjectsWithoutLevels().forEach((scratchObject) =>
      scratchObject.setLevel(level)
    );
  }

  async loadUser(userFolder) {
    (await loadJSONs(userFolder)).forEach(
      (userJSON) => this.addUser(undefined, userJSON),
      this
    );
  }

  async loadProject(projectFolder) {
    const projects = await loadProjects(projectFolder);
    const combinedProjects =
      projects.length > 0
        ? projects.reduce((result, current) => Object.assign(result, current))
        : {};
    (await loadJSONs(projectFolder)).forEach(
      (projectJSON) =>
        this.addProject(
          undefined,
          Object.assign(projectJSON, combinedProjects)
        ),
      this
    );
  }

  async loadStudio(studioFolder) {
    (await loadJSONs(studioFolder)).forEach(
      (studioJSON) => this.addStudio(undefined, studioJSON),
      this
    );
  }

  async loadArchive() {
    const userFolders = await getFolders(this.archivePath);
    const promises = [];
    for (const userFolder of userFolders) {
      promises.push(this.loadUser(userFolder));
      promises.push(
        (async () => {
          await Promise.all(
            (
              await getFolders(userFolder + PROJECTS_FOLDER)
            ).map(this.loadProject, this)
          );
        })()
      );
      promises.push(
        (async () => {
          await Promise.all(
            (
              await getFolders(userFolder + STUDIOS_FOLDER)
            ).map(this.loadStudio, this)
          );
        })()
      );
    }
    await Promise.all(promises);
  }

  async parseFileName(file) {
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

  async cleanUpFile(file) {
    const { parentPath, fileName, name, idAddition, id, type } =
      this.parseFileName(file);

    let fileNameAddition = type;
    if (type === "/") {
      await Promise.all(getItemsInFolder(file).map(this.cleanUpFile));
      fileNameAddition = idAddition + type;
    }

    let newFileName;
    if (name === MISSING_USERNAME_INDICATOR)
      newFileName = this.getUserFileName({ id: id });
    else if (name === MISSING_PROJECT_TILE_INDICATOR)
      newFileName = this.getProjectFileName({ id: id });
    else if (name === MISSING_STUDIO_TITLE_INDICATOR)
      newFileName = this.getStudioFileName({ id: id });
    else return;

    if (fileName !== newFileName) {
      await moveFile(file, parentPath + newFileName + fileNameAddition);
    }
  }

  async cleanUpArchive() {
    this.findIDToNameConversions();
    await this.cleanUpFile(ScratchArchive);
  }
}
