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

export class ScratchObject {
  _xToken;
  _sessionID;

  _collected;
  _gathered;

  addData(data) {
    if (data && data.code !== "NotFound") {
      for (const [key, value] of Object.entries(data)) {
        if (value) {
          this[key] = value;
        }
      }
      // Object.assign(this, data);
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

  async _childCollectData() {
    throw new Error("_childCollectData() not implemented");
  }

  async collectData(checkCollected = true) {
    if (checkCollected && this._collected) return;

    // for (const func of Object.getOwnPropertyNames(
    //   Object.getPrototypeOf(this)
    // )) {
    //   if (func.search(/^add/) >= 0) {
    //     try {
    //       console.log(`await this.${func}()`);
    //       await eval(`this.${func}()`);
    //     } catch (e) {
    //       if (!(e instanceof AuthorizationError)) throw e;
    //     }
    //   }
    // }

    await this._childCollectData();

    if (checkCollected) {
      this._collected = true;
      this._gathered = false;
    }
  }

  hasGathered() {
    return this._gathered;
  }

  setGathered(gathered) {
    this._gathered = gathered;
  }

  gatherUsers() {
    throw new Error("gatherUsers not implemented");
  }

  gatherProjects() {
    throw new Error("gatherProjects not implemented");
  }

  gatherStudios() {
    throw new Error("gatherStudios not implemented");
  }

  gatherObjects(checkGathered = true) {
    if (checkGathered && this.hasGathered) {
      return [];
    }

    const gatheredUsers = this.gatherUsers();
    const gatheredProjects = this.gatherProjects();
    const gatheredStudios = this.gatherStudios();

    if (checkGathered) this.setGathered(true);

    return { gatheredUsers, gatheredProjects, gatheredStudios };
  }

  _extendArray(array, object) {
    if (object) {
      array.push(...object);
    }
  }

  _addCommentsToUsers(users, comments) {
    if (comments) {
      this._extendArray(
        users,
        comments.map((comment) => comment.author)
      );
      comments.forEach((comment) => {
        if (comment.replies) {
          this._extendArray(
            users,
            comment.replies.map((reply) => reply.author)
          );
        }
      });
    }
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
    super(baseData);
    if (username) this.username = username;
    this._sessionID = sessionID;
    this._xToken = xToken;
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
      // throw new AuthorizationError(
      //   "ScratchUser.addUnsharedProjects requires that sessionID or password be provided to this object."
      // );
    }

    const unsharedProjects = await UserAPI.getUnsharedProjects(
      this._sessionID,
      this._xToken
    );
    this.addData({ unsharedProjects });
  }

  async addTrashedProjects() {
    if (this._sessionID === undefined) {
      return;
      // throw new AuthorizationError(
      //   "ScratchUser.addTrashedProjects requires that sessionID or password be provided to this object."
      // );
    }

    const trashedProjects = await UserAPI.getTrashedProjects(
      this._sessionID,
      this._xToken
    );
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

  async _childCollectData() {
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
    ]);
  }

  gatherUsers() {
    const users = [];
    this._extendArray(users, this.followers);
    this._extendArray(users, this.following);
    this._addCommentsToUsers(users, this.comments);
    return users;
  }

  gatherProjects() {
    const projects = [];
    this._extendArray(projects, this.sharedProjects);
    this._extendArray(projects, this.unsharedProjects);
    this._extendArray(projects, this.trashedProjects);
    // needs usernames in case the user is removed so that we know which folder
    // to put project in
    this._extendArray(projects, this.favorites);
    return projects;
  }

  gatherStudios() {
    const studios = [];
    // needs username so that we know which folder to put project in
    // TODO: Maybe scrape scratch website
    // https://scratch.mit.edu/studios/75048/curators
    // has "Studio Host" under name
    this._extendArray(studios, this.curatedStudios);
    this._extendArray(studios, this.followedStudios);
    return studios;
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
    super(baseData);
    if (projectID) this.id = projectID;
    if (username) {
      if (!this.author) this.author = {};
      this.author.username = username;
    }
    this._xToken = xToken;
  }

  async addProjectInfo() {
    const projectData = ProjectAPI.getProjectInfo(this.id, this._xToken);
    this.addData(projectData);
  }

  async addRemixes() {
    const remixes = await ProjectAPI.getRemixes(this.id, this._xToken);
    this.addData({ remixes });
  }

  async #handleUsernameRequiredCall(apiCall, dataName) {
    try {
      const username = this.author ? this.author.username : this.username;
      const datas = await apiCall(this.id, username, this._xToken);
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

  async #handleProjectAdd(apiCall, projectVariableName) {
    const options = {
      // May be called periodically with progress updates.
      onProgress: (type, loaded, total) => {
        // type is 'metadata', 'project', 'assets', or 'compress'
        console.log(type, loaded / total);
      },
    };
    try {
      const project = await apiCall(this.id, options);
      if (project) {
        if (this.title) {
          project.title = this.title;
        } else {
          if (project.title !== "") this.title = project.title;
        }
        this.addData({ [projectVariableName]: project });
      }
    } catch (canNotAccessProjectError) {
      if (canNotAccessProjectError.name !== "CanNotAccessProjectError")
        throw canNotAccessProjectError;
    }
  }

  async addProjectFromWaybackMachine() {
    let projectVariableName = "project";
    if ("project" in this) projectVariableName = "waybackProject";
    this.#handleProjectAdd(
      ProjectAPI.getProjectFromWaybackMachine,
      projectVariableName
    );
  }

  async addProject() {
    this.#handleProjectAdd(downloadProjectFromID, "project");
    if (!("project" in this)) {
      this.addProjectFromWaybackMachine;
    } else if ("history" in this && "modified" in this.history) {
      const waybackAvailability = getProjectWaybackAvailability(this.id);

      if (
        waybackAvailability.archived_snapshots &&
        waybackAvailability.archived_snapshots.closest
      ) {
        const availableDate = new Date(
          waybackAvailability.archived_snapshots.closest.timestamp
        );
        const lastModifiedDate = new Date(this.history.modified);

        if (availableDate < lastModifiedDate) {
          this.addProjectFromWaybackMachine();
          if ("waybackProject" in this) {
            this.waybackProject["date"] = availableDate;
          }
        }
      }
    }
  }

  async _childCollectData() {
    // call these now because they don't require the project author's username,
    // but don't await them till after the projectInfo call when we can call the
    // rest of the data functions
    const nonUsernameReliantCalls = [this.addRemixes(), this.addProject()];

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
    const users = [];
    // needs username to know where to store
    this._extendArray(users, [this.author]);
    _addCommentsToUsers(users, this.comments);
    return users;
  }

  gatherProjects() {
    const projects = [];
    this._extendArray(projects, this.remixes);
    if (this.remix) {
      // these don't have username or userid (plus they don't have the project title)
      this._extendArray(projects, [this.remix.parent, this.remix.root]);
    }
    return projects;
  }

  gatherStudios() {
    const studios = [];
    // needs host username to know which folder to put in
    this._extendArray(studios, this.studios);
    return studios;
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
      if (property !== "project" && property !== "waybackProject") {
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
    super(baseData);
    if (studioID) this.id = studioID;
  }

  async addStudioInfo() {
    const studioData = StudioAPI.getStudioInfo(this.id);
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

  async _childCollectData() {
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
    const users = [];
    // needs username to know where to store
    if (this.host) this._extendArray([{ id: this.host }]);
    this._extendArray(users, this.curators);
    this._extendArray(users, this.managers);
    this._extendArray(
      users,
      this.activity.map((act) => {
        return { id: act.actor_id, username: act.username };
      })
    );
    _addCommentsToUsers(users, this.comments);
    return users;
  }

  gatherProjects() {
    const projects = [];
    this._extendArray(projects, this.projects);
    this._extendArray(
      projects,
      this.activity.map((act) => {
        return { id: act.project_id, title: act.project_title };
      })
    );
    return projects;
  }

  gatherStudios() {
    const studios = [];
    return studios;
  }
}
