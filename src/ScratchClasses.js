import { apiRequest, DATE_LIMIT_STRING } from "./apiRequest.js";
import {
  checkFile,
  dumpImage,
  dumpJSON,
  dumpProject,
  formatID,
  getFiles,
  getUserDataFromComments,
  getValidFilename,
  getValidFolderName,
  FORBIDDEN_CHARACTERS,
} from "./helperFunctions.js";
import { ProjectAPI, StudioAPI, UserAPI } from "./ScratchAPI.js";

const PROJECTS_FOLDER = "projects/";
const STUDIOS_FOLDER = "studios/";

const MISSING_USERNAME_INDICATOR = "-Unable to Acquire Username-";
const MISSING_PROJECT_TILE_INDICATOR = "-Unable to Acquire Project Title-";
const MISSING_STUDIO_TITLE_INDICATOR = "-Unable to Acquire Studio Title-";
const UNKNOWN_USER_INDICATOR = "-Unable to Identify User-";

const PROJECT_TITLE_REGEX = "^(.*)";
const TIMESTAMP_REGEX = ` (\\d{4}-\\d{2}-\\d{2}T\\d{2}${FORBIDDEN_CHARACTERS[":"]}?\\d{2}${FORBIDDEN_CHARACTERS[":"]}?\\d{2}\\.000Z)`;
const PROJECT_TYPE_REGEX = "\\.(sb[23]?)$";

class ScratchObject {
  _xToken;
  _sessionID;

  _collected;
  _gathered;
  _level;

  addData(data = {}) {
    if (data.code !== "NotFound") {
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          if (key === "_level") {
            this.setLevelIfHigher(value);
          } else {
            this[key] = value;
          }
        }
      }
      // Object.assign(this, data);
    }
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

  constructor({ baseData = {}, level } = {}) {
    this._level = level;
    this._collected = false;
    this._gathered = false;
    this.addData(baseData);
  }

  setLevel(level) {
    this._level = isNaN(level) ? level : max(level, 0);
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

  async collectData({ checkCollected = true } = {}) {
    if (checkCollected && this.hasCollected()) return false;

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
    const level = this.getLevel();
    return level && (!checkGathered || !this.hasGathered());
  }

  gatherObjects({ checkGathered = true } = {}) {
    if (!this.shouldGather(checkGathered)) {
      return { gatheredUsers: [], gatheredProjects: [], gatheredStudios: [] };
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
      if (property.charAt(0) !== "_") {
        data[property] = this[property];
      }
    }
    return data;
  }

  getMetaData() {
    const metadata = {};
    metadata._collected = this.hasCollected();
    metadata._gathered = this.hasGathered();
    metadata._level = this.getLevel();
    Object.assign(metadata, this.getIdentifiers());
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
  constructor({ username, level, baseData = {}, sessionID, xToken }) {
    super({ baseData, level });
    if (username) this.username = username;
    this._sessionID = sessionID;
    this._xToken = xToken;
  }

  getTitle() {
    return this.username;
  }

  setTitle(title) {
    if (title && !this.username) this.username = title;
  }

  getUsername() {
    return this.getTitle();
  }

  setUsername(username) {
    this.setTitle(username);
  }

  getUserID() {
    return this.getID();
  }

  getImageLinks() {
    return this.profile && this.profile.images
      ? Object.values(this.profile.images)
      : [];
  }

  static getMissingIndicator() {
    return MISSING_USERNAME_INDICATOR;
  }

  getIdentifiers() {
    return Object.assign(super.getIdentifiers(), {
      username: this.getUsername(),
    });
  }

  getMissingIndicator() {
    return ScratchUser.getMissingIndicator();
  }

  getParentPath() {
    return this.getUserPath();
  }

  async addUserInfo() {
    const userData = await UserAPI.getUserInfo(this.username);
    this.addData(userData);
  }

  async addFavorites() {
    const favorites = await UserAPI.getFavorites(this.username);
    this.addData({ favorites });
  }

  async addFollowers() {
    const followers = await UserAPI.getFollowers(this.username);
    this.addData({ followers });
  }

  async addFollowing() {
    const following = await UserAPI.getFollowing(this.username);
    this.addData({ following });
  }

  async addCuratedStudios() {
    const curatedStudios = await UserAPI.getCuratedStudios(this.username);
    this.addData({ curatedStudios });
  }

  async addSharedProjects() {
    const sharedProjects = await UserAPI.getSharedProjects(this.username);
    this.addData({ sharedProjects });
  }

  async addUnsharedProjects() {
    if (this._sessionID === undefined) {
      return;
    }

    const unsharedProjects = await UserAPI.getUnsharedProjects(
      this._sessionID,
      { xToken: this._xToken }
    );
    this.addData({ unsharedProjects });
  }

  async addTrashedProjects() {
    if (this._sessionID === undefined) {
      return;
    }

    const trashedProjects = await UserAPI.getTrashedProjects(this._sessionID, {
      xToken: this._xToken,
    });
    this.addData({ trashedProjects });
  }

  async addProfileComments() {
    const profileComments = await UserAPI.getProfileComments(this.username);
    this.addData({ profileComments });
  }

  async addFollowedStudios() {
    const followedStudios = await UserAPI.getFollowedStudios(this.username);
    this.addData({ followedStudios });
  }

  async addActivity() {
    const activity = await UserAPI.getActivity(this.username, {
      userID: this.id,
    });
    this.addData({ activity });
  }

  async childCollectData() {
    await Promise.all([
      this.addUserInfo(),
      this.addFavorites(),
      this.addFollowers(),
      this.addFollowing(),
      this.addCuratedStudios(),
      this.addSharedProjects(),
      this.addUnsharedProjects(),
      this.addTrashedProjects(),
      this.addProfileComments(),
      this.addFollowedStudios(),
      this.addActivity(),
    ]);
  }

  gatherUsers() {
    return super.gatherUsers([
      this.followers,
      this.following,
      getUserDataFromComments(this.comments),
      this.activity
        .filter((act) => "user_username" in act)
        .map((act) => {
          return { id: act.user_id, title: act.user_username };
        }),
    ]);
  }

  gatherProjects() {
    return super.gatherProjects([
      this.sharedProjects,
      this.unsharedProjects,
      this.trashedProjects,
      this.favorites,
      this.activity
        .filter((act) => "project_id" in act)
        .map((act) => {
          return { id: act.project_id, title: act.project_title };
        }),
      this.activity
        .filter((act) => "project_remix_id" in act)
        .map((act) => {
          return { id: act.project_remix_id, title: act.project_remix_title };
        }),
    ]);
  }

  gatherStudios() {
    return super.gatherStudios([
      this.curatedStudios,
      this.followedStudios,
      this.activity
        .filter((act) => "studio_id" in act)
        .map((act) => {
          return { id: act.studio_id, title: act.studio_title };
        }),
    ]);
  }

  isSameScratchObject(scratchObject) {
    if (this.getUsername() === undefined)
      return super.isSameScratchObject(scratchObject);
    else
      return (
        scratchObject.getUsername() === this.getUsername() &&
        scratchObject.constructor !== this.constructor
      );
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
  constructor({ projectID, level, baseData = {}, username, xToken }) {
    super({ baseData, level });
    if (projectID) this.id = projectID;
    if (username) {
      if (!this.author) this.author = {};
      this.author.username = username;
    }
    this._xToken = xToken;
  }

  getUsername() {
    return this.username
      ? this.username
      : this.author
      ? this.author.username
      : undefined;
  }

  setUsername(username) {
    if (username) {
      if (this.author) {
        if (!this.author.username) this.author.username = username;
      } else if (!this.username) this.username = username;
    }
  }

  getUserID() {
    return this.creator_id
      ? this.creator_id
      : this.author
      ? this.author.id
      : undefined;
  }

  static getMissingIndicator() {
    return MISSING_PROJECT_TILE_INDICATOR;
  }

  getMissingIndicator() {
    return ScratchProject.getMissingIndicator();
  }

  getSubFolder() {
    return PROJECTS_FOLDER;
  }

  getImageLinks() {
    const imageLinks = this.images ? Object.values(this.images) : [];
    if (this.image) imageLinks.push(this.image);
    return imageLinks;
  }

  async addProjectInfo() {
    const projectData = await ProjectAPI.getProjectInfo(this.id, {
      xToken: this._xToken,
    });
    this.addData(projectData);
  }

  async addRemixes() {
    const remixes = await ProjectAPI.getRemixes(this.id, {
      xToken: this._xToken,
    });
    this.addData({ remixes });
  }

  async #handleUsernameRequiredCall(apiCall, dataName) {
    try {
      const username = this.author ? this.author.username : this.username;
      const datas = await apiCall(this.id, { username, xToken: this._xToken });
      this.addData({ [dataName]: datas });
    } catch (error) {
      if (error.name !== "ProjectUsernameError") {
        throw error;
      }
    }
  }

  async addStudios() {
    this.#handleUsernameRequiredCall(ProjectAPI.getStudios, "studios");
  }

  async addComments() {
    this.#handleUsernameRequiredCall(ProjectAPI.getComments, "comments");
  }

  async childCollectData() {
    // call these now because they don't require the project author's username,
    // but don't await them till after the projectInfo call when we can call the
    // rest of the data functions
    const nonUsernameReliantCalls = [this.addRemixes()];

    if (!this.author || !this.author.username) {
      await this.addProjectInfo();
    } else {
      // if we already have the project's username, then we don't need to await
      // to get it before calling the username reliant functions
      nonUsernameReliantCalls.push(this.addProjectInfo());
    }

    await Promise.all([
      ...nonUsernameReliantCalls,
      this.addStudios(),
      this.addComments(),
    ]);
  }

  gatherUsers() {
    return super.gatherUsers([
      this.author,
      getUserDataFromComments(this.comments),
    ]);
  }

  gatherProjects() {
    return super.gatherProjects([
      this.remixes,
      this.remix ? [{ id: this.remix.parent }, { id: this.remix.root }] : [],
    ]);
  }

  gatherStudios() {
    return super.gatherStudios([this.studios]);
  }

  async #handleProjectGet(downloadProject, { olderThanDate } = {}) {
    const sbDownloaderOptions = {
      // // May be called periodically with progress updates.
      // onProgress: (type, loaded, total) => {
      //   // type is 'metadata', 'project', 'assets', or 'compress'
      //   console.log(type, loaded / total);
      // },
    };
    const project = await downloadProject(this.getID(), {
      sbDownloaderOptions,
      xToken: this._xToken,
      olderThanDate,
    });
    return project;
  }

  async storeProjects(archivePath) {
    const fileName = this.getFileName();
    const projectParentPath = archivePath + this.getParentPath();
    const projectPath = archivePath + this.getParentPath() + fileName;
    const files = await getFiles(projectParentPath);
    let project;
    if (
      !files.some((file) =>
        new RegExp(fileName + PROJECT_TYPE_REGEX).test(file)
      )
    ) {
      project = await this.#handleProjectGet(ProjectAPI.getProjectFromScratch);
    }

    let getFromWayback = false;
    let lastModifiedDate;
    if (
      !files.some((file) =>
        new RegExp(fileName + TIMESTAMP_REGEX + PROJECT_TYPE_REGEX).test(file)
      )
    ) {
      if (project) {
        if (this.history && this.history.modified) {
          lastModifiedDate = new Date(this.history.modified);
          getFromWayback = true;
        }
      } else {
        getFromWayback = true;
      }
    }

    return Promise.all([
      dumpProject(project, projectPath),
      (async () => {
        if (getFromWayback) {
          await dumpProject(
            await this.#handleProjectGet(
              ProjectAPI.getProjectFromWaybackMachine,
              {
                olderThanDate: lastModifiedDate,
              }
            ),
            projectPath
          );
        }
      })(),
    ]);
  }

  async store(archivePath) {
    return Promise.all([
      super.store(archivePath),
      this.storeProjects(archivePath),
    ]);
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
  constructor({ studioID, level, baseData = {} }) {
    super({ baseData, level });
    if (studioID) this.id = studioID;
  }

  getUsername() {
    return this.host_username
      ? this.host_username
      : this.managers && this.managers.length > 0
      ? this.managers[0].username
      : undefined;
  }

  setUsername(username) {
    if (username) {
      if (this.managers && this.managers.length > 0) {
        if (!this.managers[0].username) this.managers[0].username = username;
      } else if (!this.host_username) {
        this.host_username = username;
      }
    }
  }

  getUserID() {
    return this.host
      ? this.host
      : this.managers && this.managers.length > 0
      ? this.managers[0].id
      : undefined;
  }

  static getMissingIndicator() {
    return MISSING_STUDIO_TITLE_INDICATOR;
  }

  getMissingIndicator() {
    return ScratchStudio.getMissingIndicator();
  }

  getSubFolder() {
    return STUDIOS_FOLDER;
  }

  getImageLinks() {
    return this.image ? this.image : [];
  }

  async addStudioInfo() {
    const studioData = await StudioAPI.getStudioInfo(this.id);
    this.addData(studioData);
  }

  async addActivity() {
    const activity = await StudioAPI.getActivity(this.id);
    this.addData({ activity });
  }

  async addComments() {
    const comments = await StudioAPI.getComments(this.id);
    this.addData({ comments });
  }

  async addCurators() {
    const curators = await StudioAPI.getCurators(this.id);
    this.addData({ curators });
  }

  async addManagers() {
    const managers = await StudioAPI.getManagers(this.id);
    this.addData({ managers });
  }

  async addProjects() {
    const projects = await StudioAPI.getProjects(this.id);
    this.addData({ projects });
  }

  async childCollectData() {
    await Promise.all([
      this.addStudioInfo(),
      this.addActivity(),
      this.addComments(),
      this.addCurators(),
      this.addManagers(),
      this.addProjects(),
    ]);
  }

  gatherUsers() {
    return super.gatherUsers([
      { id: this.host },
      this.curators,
      this.managers,
      this.activity
        .filter((act) => "username" in act)
        .map((act) => {
          return { id: act.actor_id, username: act.username };
        }),
    ]);
  }

  gatherProjects() {
    return super.gatherProjects([
      this.projects,
      this.activity
        .filter((act) => "project_id" in act)
        .map((act) => {
          return { id: act.project_id, title: act.project_title };
        }),
    ]);
  }

  gatherStudios() {
    return super.gatherStudios([]);
  }
}
