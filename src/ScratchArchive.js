import {
  ScratchProject,
  ScratchUser,
  ScratchStudio,
} from "./ScratchClasses.js";
import { getSessionIDAndXToken, getXToken } from "./ScratchAPI.js";

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

  addUser(username, baseData = {}) {
    const userIndex = this.users.find((user) => user.username === username);
    let user = null;
    if (userIndex) {
      user = user[userIndex];
    } else {
      const authData = this.getAuthorization(username);
      user = new ScratchUser(
        username,
        baseData,
        authData.sessionID,
        authData.xToken
      );
      this.users.push(user);
    }
    return user;
  }

  addProject(projectID, baseData = {}, username) {
    if (!username) username = baseData.username;
    const projectIndex = this.projects.find(
      (project) => project.projectID === projectID
    );
    const project = null;
    if (projectIndex) {
      project = projects[projectIndex];
    } else {
      authData = this.getAuthorization(username);
      project = new ScratchProject(
        projectID,
        baseData,
        username,
        authData.xToken
      );
      this.projects.push(project);
    }
    return project;
  }

  addStudio(studioID, baseData) {
    const studioIndex = this.studios.find(
      (studio) => studio.studioID === studioID
    );
    const studio = null;
    if (studioIndex) {
      return studios[studioIndex];
    } else {
      studio = new ScratchStudio(studioID, baseData);
      this.studios.push(studio);
    }
    return studio;
  }

  async collectData() {
    await Promise.all(
      this.users
        .concat(this.projects)
        .concat(this.studios)
        .map((scratchObject) => scratchObject.collectData())
    );
  }

  gatherData() {
    const gatherMoreScratchObjects = (scratchObject) =>
      scratchObject.gatherMoreScratchObjects(this);
    this.users.forEach(gatherMoreScratchObjects);
    this.projects.forEach(gatherMoreScratchObjects);
    this.studios.forEach(gatherMoreScratchObjects);
  }

  async completeDataSweeps(numSweeps = 1) {
    for (let i = 0; i < numSweeps; i++) {
      this.gatherData();
      await this.collectData();
    }
  }
}
