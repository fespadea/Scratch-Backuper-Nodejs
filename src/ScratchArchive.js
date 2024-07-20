import {
  ScratchProject,
  ScratchUser,
  ScratchStudio,
} from "./ScratchClasses.js";
import { getSessionIDAndXToken, getXToken } from "./ScratchAPI.js";
import {
  getFolders,
  loadJSONs,
  moveFile,
  getItemsInFolder,
  parseFileName,
} from "./helperFunctions.js";
import { dumpJSON } from "./helperFunctions.js";
import { loadJSON } from "./helperFunctions.js";
import { removePrivateInformation } from "./helperFunctions.js";

const DEFAULT_ARCHIVE_PATH = "./ScratchArchive/";
const METADATA_FILE_NAME = "Archive_Metadata";

export class ScratchArchive {
  #authorizations;

  constructor({ archivePath = DEFAULT_ARCHIVE_PATH } = {}) {
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

  async logIn(username, { password, xToken, sessionID }) {
    const authData = {};
    if (password && !sessionID) {
      const loginData = await getSessionIDAndXToken(username, password);
      authData.sessionID = loginData.sessionID;
      authData.xToken = loginData.xToken;
    } else if (sessionID && !xToken) {
      authData.sessionID = sessionID;
      authData.xToken = await getXToken(sessionID);
    } else if (xToken) {
      authData.xToken = xToken;
    }
    if (authData.sessionID || authData.xToken) {
      this.#authorizations[username] = authData;
      this.users.forEach((user) => {
        if (user.getUsername() === username)
          user.updateAuthorization({
            xToken: authData.xToken,
            sessionID: authData.sessionID,
          });
      });
      if (authData.xToken) {
        this.projects.forEach((project) => {
          if (project.getUsername() === username) {
            project.updateAuthorization({ xToken: authData.xToken });
          }
        });
      }
    }
  }

  getAuthorization(username) {
    return username in this.#authorizations
      ? this.#authorizations[username]
      : {};
  }

  addScratchObject(newScratchObject, { scratchObjectArray } = {}) {
    if (!scratchObjectArray) {
      if (newScratchObject instanceof ScratchUser)
        scratchObjectArray = this.users;
      else if (newScratchObject instanceof ScratchProject)
        scratchObjectArray = this.projects;
      else if (newScratchObject instanceof ScratchStudio)
        scratchObjectArray = this.studios;
      else return null;
    }

    const objectIndex = scratchObjectArray.findIndex((scratchObject) =>
      newScratchObject.isSameScratchObject(scratchObject)
    );
    if (objectIndex >= 0) {
      scratchObjectArray[objectIndex].addData(newScratchObject);
      return scratchObjectArray[objectIndex];
    }
    const authData = this.getAuthorization(newScratchObject.getUsername());
    newScratchObject.updateAuthorization({
      xToken: authData.xToken,
      sessionID: authData.sessionID,
    });
    scratchObjectArray.push(newScratchObject);
    this.foundIDToNameConversions = false;
    return newScratchObject;
  }

  addUser({ username, baseData = {}, level }) {
    return this.addScratchObject(
      new ScratchUser({
        username,
        baseData,
        level,
      }),
      { scratchObjectArray: this.users }
    );
  }

  addProject({ projectID, baseData = {}, username, level }) {
    return this.addScratchObject(
      new ScratchProject({
        projectID,
        baseData,
        username,
        level,
      }),
      { scratchObjectArray: this.projects }
    );
  }

  addStudio({ studioID, baseData = {}, level }) {
    return this.addScratchObject(
      new ScratchStudio({
        studioID,
        baseData,
        level,
      }),
      { scratchObjectArray: this.studios }
    );
  }

  async collectData({ storeAsYouGo = false } = {}) {
    await Promise.all(
      this.users
        .concat(this.projects)
        .concat(this.studios)
        .map(async (scratchObject) => {
          const didCollectData = await scratchObject.collectData();
          if (didCollectData && storeAsYouGo)
            this.storePromises.push(scratchObject.store(this.archivePath));
        })
    );
    this.foundIDToNameConversions = false;
  }

  gatherScratchObjects() {
    [...this.users, ...this.projects, ...this.studios].forEach(
      (scratchObject) => {
        scratchObject
          .gatherObjects()
          .forEach(
            (gatheredObject) =>
              this.addScratchObject({ baseData: gatheredObject }),
            this
          );
      },
      this
    );
  }

  async completeDataSweeps({ storeAsYouGo = false, numSweeps = -1 } = {}) {
    let collectDataPromise = this.collectData({ storeAsYouGo });
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
      collectDataPromise = this.collectData({ storeAsYouGo });
    }
    await collectDataPromise;
    if (storeAsYouGo) {
      await Promise.all(this.storePromises);
      await this.storeMetaData();
    }
  }

  findIDToNameConversions() {
    if (this.foundIDToNameConversions) return;
    const gatherFromScratchObject = (scratchObject) =>
      scratchObject.gatherObjects({ checkGathered: false });
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
      if (user && user.getID() && user.getTitle()) {
        this.userIDToNames[user.getID()] = user.getTitle();
      }
    });
    [...this.projects, ...gatheredProjects].forEach((project) => {
      if (project && project.getID() && project.getTitle()) {
        this.projectIDToTitles[project.getID()] = project.getTitle();
      }
    });
    [...this.studios, ...gatheredStudios].forEach((studio) => {
      if (studio && studio.getID() && studio.getTitle()) {
        this.studioIDToTitles[studio.getID()] = studio.getTitle();
      }
    });
    this.foundIDToNameConversions = true;
  }

  getTitleFromScratchObject(scratchObject) {
    if (scratchObject.getID())
      if (scratchObject instanceof ScratchUser)
        return this.userIDToNames[scratchObject.getID()];
      else if (scratchObject instanceof ScratchProject)
        return this.projectIDToTitles[scratchObject.getID()];
      else if (scratchObject instanceof ScratchStudio)
        return this.studioIDToTitles[scratchObject.getID()];
  }

  applyIDToNameConversions() {
    this.users
      .concat(this.projects)
      .concat(this.studios)
      .forEach((scratchObject) => {
        scratchObject.setUsername(
          this.userIDToNames[scratchObject.getUserID()]
        );
        scratchObject.setTitle(this.getTitleFromScratchObject(scratchObject));
      });
  }

  async storeArchive() {
    this.findIDToNameConversions();
    this.applyIDToNameConversions();

    await Promise.all([
      ...this.users
        .concat(this.projects)
        .concat(this.studios)
        .map((scratchObject) => scratchObject.store(this.archivePath)),
      this.storeMetaData(),
    ]);
  }

  async storeMetaData() {
    return dumpJSON(this, `${this.archivePath}${METADATA_FILE_NAME}.json`);
  }

  toJSON() {
    const metadata = {};
    metadata.authorizationsUsedInArchive = JSON.parse(
      removePrivateInformation(JSON.stringify(this.#authorizations))
    );
    metadata.userMetadatas = this.users.map((user) => user.getMetaData());
    metadata.projectMetadatas = this.projects.map((project) =>
      project.getMetaData()
    );
    metadata.studioMetadatas = this.studios.map((studio) =>
      studio.getMetaData()
    );
    return metadata;
  }

  async loadMetadata(metadataPath) {
    const metadata = await loadJSON(metadataPath);
    metadata.userMetadatas.forEach((userMetadata) => {
      this.addUser(new ScratchUser({ baseData: userMetadata }));
    }, this);
    metadata.projectMetadatas.forEach((projectMetadata) => {
      this.addProject(new ScratchProject({ baseData: projectMetadata }));
    }, this);
    metadata.studioMetadatas.forEach((studioMetadata) => {
      this.addStudio(new ScratchStudio({ baseData: studioMetadata }));
    }, this);
    if (Object.keys(metadata).length > 0) {
      const missingAuthorizations = metadata.authorizationsUsedInArchive.filter(
        (authPlaceHolder) =>
          this.#authorizations.find(
            (authData) =>
              authData.username === authPlaceHolder.username &&
              (!("sessionID" in Object.keys(authPlaceHolder)) ||
                "sessionID" in Object.keys(authData))
          ) < 0
      );
      return missingAuthorizations;
    } else {
      return {};
    }
  }

  getObjectsWithoutLevels() {
    return this.users
      .concat(this.projects)
      .concat(this.studios)
      .filter((scratchObject) => scratchObject.getLevel() === undefined);
  }

  applyLevelToObjectsWithoutLevels({ level = 0 } = {}) {
    this.getObjectsWithoutLevels().forEach((scratchObject) =>
      scratchObject.setLevel(level)
    );
  }

  async loadUser(userFolder) {
    (await loadJSONs(userFolder)).forEach(
      (baseData) => this.addUser({ baseData }),
      this
    );
  }

  async loadProject(projectFolder) {
    (await loadJSONs(projectFolder)).forEach(
      (baseData) => this.addProject({ baseData }),
      this
    );
  }

  async loadStudio(studioFolder) {
    (await loadJSONs(studioFolder)).forEach(
      (baseData) => this.addStudio({ baseData }),
      this
    );
  }

  async loadArchive({ archiveToLoadPath = this.archivePath } = {}) {
    const userFolders = await getFolders(archiveToLoadPath);
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
    return await loadMetadata(`${archiveToLoadPath}${Archive_Metadata}.json`);
  }

  async cleanUpFile(file) {
    const { parentPath, fileName, name, idAddition, id, type } =
      parseFileName(file);

    let fileNameAddition = type;
    if (type === "/") {
      await Promise.all(getItemsInFolder(file).map(this.cleanUpFile));
      fileNameAddition = idAddition + type;
    }

    let newFileName;
    if (name === ScratchUser.getMissingIndicator())
      newFileName = this.userIDToNames[id];
    else if (name === ScratchProject.getMissingIndicator())
      newFileName = this.projectIDToTitles[id];
    else if (name === ScratchStudio.getMissingIndicator())
      newFileName = this.studioIDToTitles[id];
    else return;

    if (newFileName && fileName !== newFileName) {
      await moveFile(file, parentPath + newFileName + fileNameAddition);
    }
  }

  async cleanUpArchive() {
    this.findIDToNameConversions();
    await this.cleanUpFile(ScratchArchive);
  }
}
