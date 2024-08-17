// based on: https://stackoverflow.com/questions/40497262/how-to-version-control-an-object
export class VersionControlled {
  constructor(obj, changeLog = [], currentDate) {
    this.changeLog = new Proxy(changeLog, {});

    this.targets = [];
    this.version = 0;
    this.savedLength;
    this.hash = new Map([[obj, []]]);
    const handler = {
      get: function (target, property) {
        var x = target[property];
        if (Object(x) !== x) return x;
        this.hash.set(x, hash.get(target).concat(property));
        return new Proxy(x, handler);
      },
      set: this.update,
      deleteProperty: this.update,
    };

    this.dateCutoffs = {};
    this.setCurrentDate(currentDate);
    // this.dateCutoffs[this.currentDate] = this.version;

    this.data = new Proxy(obj, handler);
    // apply change log
    this.gotoLastVersion();
  }

  setCurrentDate(currentDate) {
    this.currentDate = currentDate;
  }

  getVersion() {
    return this.version;
  }

  getChangeLog() {
    return this.changeLog;
  }

  gotoVersion(newVersion) {
    newVersion = Math.max(0, Math.min(this.changeLog.length, newVersion));
    var chg,
      target,
      path,
      property,
      val = newVersion > this.version ? "newValue" : "oldValue";
    while (this.version !== newVersion) {
      if (this.version > newVersion) this.version--;
      chg = this.changeLog[this.version];
      path = chg.path.slice();
      property = path.pop();
      target =
        this.targets[this.version] ||
        (this.targets[this.version] = path.reduce((o, p) => o[p], obj));
      if (chg.hasOwnProperty(val)) {
        target[property] = chg[val];
      } else {
        delete target[property];
      }
      if (this.version < newVersion) this.version++;
    }
    return true;
  }

  gotoLastVersion() {
    return this.gotoVersion(this.changeLog.length);
  }

  update(target, property, value) {
    this.gotoLastVersion(); // only last version can be modified
    var change = { path: this.hash.get(target).concat([property]) };
    if (arguments.length > 2) change.newValue = value;
    // Some care concerning the length property of arrays:
    if (Array.isArray(target) && +property >= target.length) {
      this.savedLength = target.length;
    }
    if (property in target) {
      if (property === "length" && this.savedLength !== undefined) {
        change.oldValue = this.savedLength;
        this.savedLength = undefined;
      } else {
        change.oldValue = target[property];
      }
    }
    this.changeLog.push(change);
    this.targets.push(target);
    return this.gotoLastVersion();
  }
}
