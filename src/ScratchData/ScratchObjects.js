import {
  dumpProject,
  getFiles,
  getUserDataFromComments,
  FORBIDDEN_CHARACTERS,
} from "../util/helperFunctions.js";
import { ProjectAPI, StudioAPI, UserAPI } from "../util/ScratchAPI.js";
import { ScratchObject } from "./ScratchObject.js";

export const PROJECTS_FOLDER = "projects/";
export const STUDIOS_FOLDER = "studios/";

const MISSING_USERNAME_INDICATOR = "-Unable to Acquire Username-";
const MISSING_PROJECT_TILE_INDICATOR = "-Unable to Acquire Project Title-";
const MISSING_STUDIO_TITLE_INDICATOR = "-Unable to Acquire Studio Title-";
const UNKNOWN_USER_INDICATOR = "-Unable to Identify User-";

const PROJECT_TITLE_REGEX = "^(.*)";
const TIMESTAMP_REGEX = ` (\\d{4}-\\d{2}-\\d{2}T\\d{2}${FORBIDDEN_CHARACTERS[":"]}?\\d{2}${FORBIDDEN_CHARACTERS[":"]}?\\d{2}\\.000Z)`;
const PROJECT_TYPE_REGEX = "\\.(sb[23]?)$";

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
