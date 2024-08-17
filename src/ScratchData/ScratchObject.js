import { apiRequest } from "../util/apiRequest.js";
import {
  checkFile,
  dumpImage,
  dumpJSON,
  formatID,
  getValidFilename,
  getValidFolderName,
  updateObjectValue,
} from "../util/helperFunctions.js";
import { VersionControlled } from "../util/VersionControlled.js";
import { ScratchData } from "./ScratchData.js";

const MISSING_USERNAME_INDICATOR = "-Unable to Acquire Username-";
const MISSING_PROJECT_TILE_INDICATOR = "-Unable to Acquire Project Title-";
const MISSING_STUDIO_TITLE_INDICATOR = "-Unable to Acquire Studio Title-";
const UNKNOWN_USER_INDICATOR = "-Unable to Identify User-";

export class ScratchObject {
  constructor({
    data = new ScratchData(),
    sessionID,
    xToken,
    level,
    trackChanges = true,
    changeLog = [],
    date,
  } = {}) {
    this.xToken = xToken;
    this.sessionID = sessionID;

    this.level = level;
    this.collected = false;
    this.gathered = false;

    if (trackChanges) {
      this.versionControl = VersionControlled(data, changeLog);
      this.data = this.versionControl.data;
    } else {
      this.data = data;
    }
  }

  addData(data = {}, date) {
    // check that this wasn't a 404 code
    if (data.code !== "NotFound") {
      if (date) {
        this.setLastUpdate(date);
      }
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          switch (key) {
            case "_level":
              this.setLevelIfHigher(value);
              break;
            case "_collected":
              this.setCollected(value);
              break;
            case "_gathered":
              this.setGathered(value);
              break;
            case "_xToken":
              this.updateAuthorization({ xToken: value });
              break;
            case "_sessionID":
              this.updateAuthorization({ sessionID: value });
              break;
            case "_trackChanges":
              this.setTrackChanges(value);
              break;
            default:
              updateObjectValue(this, key, newObject);
              break;
          }
        }
      }
    }
  }

  setLastUpdate(lastUpdate) {
    this.m_lastUpdate = lastUpdate;
  }

  getLastUpdate() {
    if (this._vc) return this.m_lastUpdate;
  }

  shouldTrackChanges() {
    return this._trackChanges;
  }

  setTrackChanges(trackChanges) {
    this._trackChanges = trackChanges;
  }

  getUsername() {
    throw new Error("getUsername not implemented");
  }

  setUsername(username) {
    throw new Error("setUsername not implemented");
  }

  // gets overwritten by ScratchUser to return getUsername
  getTitle() {
    return this.title;
  }

  // gets overwritten by ScratchUser to call setUsername
  setTitle(title) {
    if (!this.title && title) this.title = title;
  }

  getUserID() {
    throw new Error("getUserID not implemented");
  }

  getID() {
    return this.id;
  }

  updateAuthorization({ xToken, sessionID }) {
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

  setLevel(level) {
    this._level = level;
  }

  setLevelIfHigher(level) {
    if (this.getLevel() === undefined || level > this.getLevel()) {
      this.setLevel(level);
    }
  }

  getLevel() {
    return this._level;
  }

  async childCollectData() {
    throw new Error("_childCollectData() not implemented");
  }

  hasCollected() {
    return this._collected;
  }

  setCollected(collected) {
    this._collected = collected;
  }

  isLevelHighEnough() {
    const level = this.getLevel();
    return isNaN(level) || level >= 0;
  }

  shouldCollect({ checkCollected = true } = {}) {
    return isLevelTooLow() && (!checkCollected || !this.hasCollected());
  }

  async collectData({ checkCollected = true } = {}) {
    if (!shouldCollect(checkCollected)) return false;

    await this.childCollectData();

    if (checkCollected) {
      this.setCollected(true);
      this.setGathered(false);
    }
    return true;
  }

  hasGathered() {
    return this._gathered;
  }

  setGathered(gathered) {
    this._gathered = gathered;
  }

  #createGatheredScratchObjects(arraysOfDatas, scratchClass) {
    level = this.getLevel();
    return arraysOfDatas
      .flat(1)
      .filter((baseData) => baseData !== undefined)
      .map(
        (baseData) =>
          new scratchClass({
            baseData,
            level: isNaN(level) ? undefined : level - 1,
          })
      );
  }

  gatherUsers(arraysOfUsers) {
    return this.#createGatheredScratchObjects(arraysOfUsers, ScratchUser);
  }

  gatherProjects(arraysOfProjects) {
    return this.#createGatheredScratchObjects(arraysOfProjects, ScratchProject);
  }

  gatherStudios(arraysOfStudios) {
    return this.#createGatheredScratchObjects(arraysOfStudios, ScratchStudio);
  }

  shouldGather({ checkGathered = true } = {}) {
    return isLevelTooLow() && (!checkGathered || !this.hasGathered());
  }

  gatherObjects({ checkGathered = true } = {}) {
    if (!this.shouldGather(checkGathered)) {
      return [];
    }

    const gatheredUsers = this.gatherUsers();
    const gatheredProjects = this.gatherProjects();
    const gatheredStudios = this.gatherStudios();

    if (checkGathered) this.setGathered(true);

    return [...gatheredUsers, ...gatheredProjects, ...gatheredStudios];
  }

  toJSON() {
    const data = {};
    for (const property in this) {
      if (property.charAt(0) !== "_" && property.substring(0, 2) !== "m_") {
        data[property] = this[property];
      }
    }
    return data;
  }

  getChangeLog() {
    if (this._vc) return this._vc.getChangeLog();
  }

  setChangeLog() {
    if (this._vc) return this._vc.getChangeLog();
  }

  getMetaData() {
    const metadata = {};
    Object.assign(metadata, this.getIdentifiers());
    metadata._collected = this.hasCollected();
    metadata._gathered = this.hasGathered();
    metadata._level = this.getLevel();
    if (this._vc) {
      metadata.m_lastUpdate = this.getLastUpdate();
      metadata._changeLog = this.getChangeLog();
    }
    return metadata;
  }

  loadMetaData(metadata) {
    this.setCollected(metadata._collected);
    this.setGathered(metadata._gathered);
    this.setLevel(metadata._level);
    if (metadata._vc) {
      this.setLastUpdate(metadata.m_lastUpdate);
      this.metadata._changeLog = this.getChangeLog();
    }
    return metadata;
  }

  // overwritten by ScratchUser to include username
  getIdentifiers() {
    return { id: this.getID() };
  }

  isSameScratchObject(scratchObject) {
    return (
      scratchObject.getID() === this.getID() &&
      this.getID() !== undefined &&
      scratchObject.constructor === this.constructor
    );
  }

  getMissingIndicator() {
    throw new Error("getMissingIndicator not implemented");
  }

  // overwritten by ScratchProject and ScratchStudio
  getSubFolder() {
    return "";
  }

  getFolderName() {
    let title = this.getTitle();
    if (!title) title = this.getMissingIndicator();
    title += formatID(this.getID());
    return getValidFolderName(title);
  }

  getFileName() {
    let title = this.getTitle();
    if (!title) title = this.getMissingIndicator() + formatID(this.getID());
    return getValidFilename(title);
  }

  getUserPath() {
    const userID = this.getUserID();
    const username = this.getUsername();
    const folderName = userID
      ? (username ? username : MISSING_USERNAME_INDICATOR) + formatID(userID)
      : UNKNOWN_USER_INDICATOR;
    return getValidFolderName(folderName) + "/";
  }

  // gets overwritten by ScratchUser to return getUserPath()
  getParentPath() {
    return (
      this.getUserPath() + this.getSubFolder() + this.getFolderName() + "/"
    );
  }

  getPath(archivePath) {
    return archivePath + this.getParentPath() + this.getFileName();
  }

  getImageLinks() {
    throw new Error(`getImageLinks not implemented in ${this.constructor}`);
  }

  async storeImages(archivePath) {
    const imageParentPath = archivePath + this.getParentPath();
    await Promise.all(
      this.getImageLinks().map(async (imageLink) => {
        const imagePath = imageParentPath + imageLink.match(/\/([^/]+.png)/)[1];
        if (!(await checkFile(imagePath))) {
          const imageStream = await apiRequest(imageLink, {
            cache: false,
            returnFunc: "body",
          });
          await dumpImage(imageStream, imagePath);
        }
      })
    );
  }

  // gets overwritten by ScratchProject to also store projects
  async store(archivePath) {
    await Promise.all([
      dumpJSON(this, `${this.getPath(archivePath)}.json`),
      this.storeImages(archivePath),
    ]);
  }
}
