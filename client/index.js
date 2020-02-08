const net = require("net");
const events = require("events");
const bson = require("bson");

class Client {
  constructor(options) {
    /**
     * @type any
     */
    this.options = options;
    /**
     * @type Map<string,Watcher>
     */
    this.watchers = new Map();
    /**
     * @type Buffer
     */
    this.buffer = null;
    /**
     * @type net.Socket
     */
    this.socket = null;
    /**
     * @type boolean
     */
    this.connected = false;
  }

  /**
   * @param {string} db
   * @param {string} collection
   * @param {any} filters
   */
  watch(db, collection, filters) {
    if (!this.socket) {
      this._connect();
    }
    filters = filters || {};

    for (let watcher of this.watchers.values()) {
      if (
        watcher.db === db &&
        watcher.collection === collection &&
        compare(filters, watcher.filters)
      ) {
        watcher.count += 1;
        return watcher;
      }
    }

    let watcher = new Watcher(db, collection, filters, this);

    this.watchers.set(watcher.id, watcher);

    if (this.connected) {
      watcher.watch();
    }

    return watcher;
  }

  _connect() {
    if (this.socket) return;
    this.buffer = null;
    this.socket = net.connect(
      this.options.port || 37017,
      this.options.host,
      () => {
        // connected
        this.connected = true;
        for (let watcher of this.watchers.values()) {
          watcher.socket = this.socket;
          watcher.watch();
        }
      }
    );
    this.socket.on("close", () => {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
      setTimeout(() => {
        if (!this.socket) {
          this._connect();
        }
      }, 2000);
    });
    this.socket.on("error", error => {
      console.error(error);
    });

    this.socket.on("data", buffer => {
      if (this.buffer) {
        this.buffer = Buffer.concat([this.buffer, buffer]);
      } else {
        this.buffer = buffer;
      }
      this._decode();
    });
  }

  _decode() {
    let length = this.buffer.readInt32LE();
    if (this.buffer.length < length) return;
    let buffer = this.buffer.slice(4, length - 2);
    if (this.buffer.length === length) {
      this.buffer = null;
    } else {
      this.buffer = this.buffer.slice(length);
    }
    let data = bson.deserialize(buffer);
    if (data.error) {
      console.error(`Mongo change hub error: ${data.error}`);
      return;
    }
    let watcher = this.watchers.get(data.watcher);
    if (watcher) {
      watcher.emit("change", data.data);
    }
  }
}

class Watcher extends events.EventEmitter {
  /**
   * @param {string} db
   * @param {string} collection
   * @param {any} filters
   * @param {Client} client
   */
  constructor(db, collection, filters, client) {
    super();
    this.id = String(new bson.ObjectID());
    this.db = db;
    this.collection = collection;
    this.filters = filters;
    this.client = client;
    this.count = 1;
  }

  watch() {
    this.client.socket.write(
      bson.serialize({
        watcher: this.id,
        action: "watch",
        db: this.db,
        collection: this.collection,
        filters: this.filters
      })
    );
  }

  close() {
    this.count -= 1;
    if (this.count > 0) return;
    this.client.socket.write(
      bson.serialize({
        watcher: this.id,
        action: "cancel"
      })
    );
    this.client.watchers.delete(this.id);
    this.client = null;
    this.emit("close");
    this.removeAllListeners();
  }
}

function compare(a, b) {
  let type = typeof a;
  if (type !== typeof b) return false;
  switch (type) {
    case "array":
      return;
    case "object":
      if (a === null || b === null) return a === b;
      if (isPlainObject(a)) {
        return isPlainObject(b) && compareObject(a, b);
      }
      return String(a) === String(b);
    default:
      return a === b;
  }
}

function compareObject(a, b) {
  if (Object.keys(a).length !== Object.keys(b).length) return false;
  for (let k in a) {
    if (!compare(a[k], b[k])) return false;
  }
  return true;
}

function compareArray(a, b) {
  if (a.length !== b.length) return false;
  for (let i in a) {
    if (!compare(a[i], b[i])) return false;
  }
  return true;
}

function isPlainObject(input) {
  if (Object.prototype.toString.call(input) !== "[object Object]") {
    return false;
  }

  const prototype = Object.getPrototypeOf(input);
  return prototype === null || prototype === Object.getPrototypeOf({});
}

module.exports = Client;
